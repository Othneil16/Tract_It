const riderModel = require('../models/riderMod');
const companyModel = require("../models/companyMod")
const bcrypt = require("bcrypt") 
const jwt = require("jsonwebtoken")
const {riderValidate} = require('../utilities/riderValidator')
const nodemailer = require("nodemailer");
const { riderDynamicMail } = require('../helpers/riderMailHtml');
const cloudinary = require("../imagesutils/cloudinary")


// create a nodemailer transporter
const transporter = nodemailer.createTransport({
    service: process.env.SERVICE,
    auth: {
      user: process.env.SENDER_EMAIL,
      pass: process.env.GMAIL_PASSWORD,
      secure: false
    }   
  });
  
 
// Function to generate unique ID
const generateUniqueId = (length)=> {
    const characters = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}
 

  exports.createRider = async (req, res) => {
    try {
        const { companyId } = req.company;

        // Retrieve company from the database
        const company = await companyModel.findById(companyId);
        if (!company) {
            return res.status(404).json({
                message: 'Company not found'
            });
        }

        // Check if company is verified
        if (company.isVerified !== true) {
            return res.status(400).json({
                error: "Company not verified"
            });
        }   
       
    
        const { riderFirstName, riderLastName, riderEmail, riderPhoneNumber, riderPassword, riderAddress, confirmRiderPassword} = req.body;
       


      
        // if (!req.file || req.file.profileImage) {
        //     return res.status(400).json({ error: 'No file uploaded' });
        // }

        //const file = req.file
        // const result = await cloudinary.uploader.upload(req.file.tempFilePath, {
        //     folder: 'rider-profiles',
        //     resource_type: 'auto'
        // });
        
        await riderValidate.validateAsync(req.body);

        // Check if passwords match
        if (confirmRiderPassword !== riderPassword) {
            return res.status(400).json({
                message: "Passwords do not match"
            });
        }

        // Hash rider password
        const saltedRound = bcrypt.genSaltSync(10);
        const hashedRiderPassword = bcrypt.hashSync(riderPassword, saltedRound);
        
            // Generate unique rider ID
        let uniqueId;
        let isUniqueId = false;
        while (!isUniqueId) {
            uniqueId = generateUniqueId(6);

            const existingRider = await riderModel.findOne({ riderId: uniqueId });
            if (!existingRider) {
                isUniqueId = true;
            }
        }


        // Create rider instance
        const rider = new riderModel({
            riderFirstName: riderFirstName.toUpperCase(),
            riderLastName: riderLastName.toUpperCase(),
            riderphoneNumber:riderPhoneNumber,
            riderAddress,
            riderEmail: riderEmail.toLowerCase(),
            riderPassword: hashedRiderPassword,
            riderId: uniqueId
        });

        // Generate rider token
        const riderToken = jwt.sign({
            riderId: rider._id,
            riderEmail: rider.riderEmail,
            riderPhoneNumber,
            riderFirstName,
            riderLocation: rider.riderLocation,
        }, process.env.jsonSecret, { expiresIn: "50m" });

        // Sending a verification email to the rider
        const subject = 'Kindly verify your rider account';
        const link = `${req.protocol}://${req.get('host')}/company/rider/verify-email/${riderToken}`;
        const editedRiderName = rider.riderFirstName.toUpperCase() + "." + rider.riderLastName.toUpperCase().slice(0, 1);
        const html = riderDynamicMail(link, editedRiderName);

        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: riderEmail,
            subject,
            html
        };

        // Send verification email
        await transporter.sendMail(mailOptions);

        // Save rider
         await rider.save();

        // Update company's rider array
        company.companyRiders.push(rider._id);
        await company.save();

        return res.status(201).json({
            message: `Congratulations!!! Rider account is successfully created. Kindly check your email: ${rider.riderEmail} to verify your account on our platform.`,
            rider
        });

    } catch (err) {
        return res.status(500).json({
            error: err.message
        });
    }
}


exports.riderSignIn = async (req, res) => {
    const { identifier, riderPassword } = req.body;
    try {
        // Check if the identifier is an email or rider ID
        const isEmail = /\S+@\S+\.\S+/.test(identifier);
        const isRiderId = /^[a-zA-Z0-9]{6}$/.test(identifier);

        if (!isEmail && !isRiderId) {
            return res.status(400).json({
                message: 'Invalid identifier. Please use a valid rider email or rider ID.'
            });
        }

        let rider;

        // Find rider by email or rider ID
        if (isEmail) {
            rider = await riderModel.findOne({ riderEmail: identifier.toLowerCase() });
        } else if (isRiderId) {
            rider = await riderModel.findOne({ riderId: identifier });
        }

        if (!rider) {
            return res.status(404).json({
                message: 'Rider not found'
            });
        }

        // Compare passwords
        const comparePassword = bcrypt.compareSync(riderPassword, rider.riderPassword);

        if (!comparePassword) {
            return res.status(400).json({
                message: 'Invalid password. Please enter the correct password.'
            });
        }

        // Sign JWT token
        const riderToken = jwt.sign({
            riderId: rider._id,
            riderEmail: rider.riderEmail,
            riderPhoneNumber: rider.riderPhoneNumber,
            riderAssignedPackages: rider.riderAssignedpackages // Assuming you have this field defined
        }, process.env.jsonSecret, { expiresIn: '1d' });

        // Return success message and rider data
        return res.status(200).json({
            message: `Welcome ${rider.riderFirstName}, feel free to carry out fast and reliable operations with our application`,
            riderToken,
            rider
        });

    } catch (err) {
        return res.status(500).json({
            error: err.message
        });
    }
}




// verify email
exports.verifyRiderEmail = async (req, res) => {
    try {
      const { riderToken } = req.params;
  
      // verify the token
      const { riderEmail } = jwt.verify(riderToken, process.env.jsonSecret);
  
      const rider = await riderModel.findOne({ riderEmail });
  
      // Check if user has already been verified
      if (rider.isVerified) {
        return res.status(400).json({
          error: "rider already verified"
        });
      }
  
      // update the user verification
      rider.isVerified = true;
  
      // save the changes
      await rider.save();
  
      // update the user's verification status
      const updatedRider = await riderModel.findOneAndUpdate({ riderEmail }, rider);
  
     
      res.redirect( `https://the-track-it.vercel.app/companylogin` );
  
    } catch (error) {
      res.status(500).json({
        message: error.message
      })
    }
  }
  

exports.getAllRiders = async (req, res) => {
    try {
        const riders = await riderModel.find();

      
        if (!riders || riders.length === 0) {
            return res.status(404).json({
                 message: 'No riders found' 
         });
        }

        return res.status(200).json({ riders });
    } catch (error) {
        console.error('Error fetching riders:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const http = require("http")

function getSystemIpAddress() {
    return new Promise((resolve, reject) => {
        // Make an HTTP request to a service that echoes back the client's IP address
        const request = http.get('http://ipinfo.io/ip', (response) => {
            let ipAddress = '';

            // Concatenate chunks of data to get the complete response
            response.on('data', (chunk) => {
                ipAddress += chunk;
            });

            // Once the response is complete, resolve the promise with the IP address
            response.on('end', () => {
                resolve(ipAddress.trim());
            });
        });

        // Handle errors
        request.on('error', (error) => {
            reject(error);
        });
    });
}
exports.riderLocation = async(req, res)=>{
try {
    
} catch (error) {
    
}
}


exports.getRiderLocation = async (req, res) => {
    const {riderId} = req.rider;
  try {

    const ipAddress = await getSystemIpAddress();
      // const os = require('os');
       console.log(ipAddress);
      // const location = await geocoder.geocode(req.clientIp);
      const location = await ipLocation(ipAddress);
        console.log("Geocoding result:", location);

        // You can send the geocoding result or perform any other actions here
// function getIPAddress() {
//     const networkInterfaces = os.networkInterfaces();
//     let ipAddress = null;

 
//     Object.keys(networkInterfaces).forEach(interfaceName => {
//         networkInterfaces[interfaceName].forEach(interfaceInfo => {
          
//             if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
//                 ipAddress = interfaceInfo.address;
//             }
//         }); 
//     });

//     return ipAddress;
// }


//     // Validate the data if needed
//     const newlat = Number(latitude)
//     const newlon = Number(longitude)
//       if(!newlat || !newlon){
//         return res.status(400).json({
//             message:`Number data type require`
//         })
//       }

//     // Create a new LocationModel instance
//     const newlocation = new LocationModel({ latitude:newlat, 
//     longitude:newlon
// });
    
//     if(!location){
//       return res.status(400).json({
//         message:"couldn't create"
//       })
// //     }
    // const ip =getIPAddress()
    // console.log("i am the ip"+ip)
    const geocodeResult = await geocoder.reverse({lat:location.latitude, lon:location.longitude},(error, result)=>{
      if(error){
       res.status(400).json({
         message:`Can't reverse the data`
       })
      }else{
       return result
      }
    })

 console.log('Geocoding result:', geocodeResult);

    // Save the obtained address along with the location to the database
    // location.address = geocodeResult[0].formattedAddress;
    // console.log(location.address);
     
    // Save the location to the database
    //await location.save();

    // Respond with a success message
    res.status(200).json({
         message: 'Location saved successfully'+ geocodeResult[0].formattedAddress,

         });
  } catch (err) {
    // Handle errors and respond with an error message
    res.status(500).json({ message: err.message });
    console.error('Geocoding error:', err.message);
  }
};