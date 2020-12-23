const mongoose = require('mongoose')
const Schema = mongoose.Schema

const UserSchema = new Schema ({
    telegramID:{
        type: Number,
        required: true
    },
    films: {
        type: [String],
        defualt: []
    }
})

mongoose.model('users', UserSchema)