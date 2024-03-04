const mongoose = require('mongoose')
const packageSchema= new mongoose.Schema({
    status: {
        type: String,
        enum: ['pending', 'assigned', 'in transit', 'delivered'],
        default: 'pending'
    },
    packageName:{
        type:String,
        require:true,
        unique:true
    },
    packageWeight:{
        type: Number,
        require:true
    },
    departure:{
        type: String,
        require:true,
        unique:true
    },
    destination:{
        type: String,
        require:true
    },
    user:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", 
    },
    packageId:{
        type: String,
        require:true,
        unique:true
    },
    delivered:{
        type:Boolean,
        default:false
    }
    
},{timestamp:true})

const packageModel = mongoose.model("packages", packageSchema)
module.exports = packageModel