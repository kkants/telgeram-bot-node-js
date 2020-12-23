const TelegramBot = require('node-telegram-bot-api')
const mongoose = require ('mongoose')
const helpers = require('./helpers')
const geolib = require('geolib')
const _ = require('lodash')
const config = require('./config')
const kb = require('./keyboard-buttons')
const myKeyboard = require('./myKeyboard')
const database = require('../database.json')
const fs= require('fs')
const { url } = require('inspector')
const { send } = require('process')
const {join} = require('path')

helpers.logStart()

mongoose.connect(config.DB_URL,{
     useNewUrlParser: true,
     useUnifiedTopology: true
 })
 

.then(() => console.log('MongoDB connected'))
.catch((err) => console.log(err))

require ('./models/film.model')
require ('./models/cinema.model')
require ('./models/user.model')

const Film = mongoose.model('films')
const Cinema = mongoose.model('cinemas')
const User = mongoose.model('users')

// database.films.forEach(f => new Film(f).save().catch(e => console.log(e)))
// database.cinemas.forEach(c => new Cinema(c).save().catch(e => console.log(e)))

const ACTION_TYPE = {
    TOGGLE_FAV_FILM: 'tff',
    SHOW_CINEMAS: 'sc',
    SHOW_CINEMAS_MAP: 'scm',
    SHOW_FILMS: 'sf'

}

// =====================================================
const bot = new TelegramBot (config.TOKEN, {
    polling: true
    
})

bot.on('message', msg =>{

    const chatId = helpers.getChatId(msg)

    switch(msg.text){
        case kb.home.favorite:
            showFavoriteFilms(chatId, msg.from.id)
         break
        case kb.home.films:
            bot.sendMessage(chatId, 'Choose genre:',
            {
                reply_markup: { keyboard: myKeyboard.films}
            })
         break
        case kb.film.comedy:
            sendFilmsByQuery(chatId, {type:'comedy'})
            break
        case kb.film.action:
            sendFilmsByQuery(chatId, {type:'action'})
         break
        case kb.film.random:
            sendFilmsByQuery(chatId, {})
            break
        case kb.home.cinemas:
            bot.sendMessage(chatId, 'Give location',{
                reply_markup: {
                    keyboard: myKeyboard.cinemas
                }
            })
            break
        case kb.back:
            bot.sendMessage(chatId, 'What do you prefer?',
            {
                reply_markup:{

                    keyboard: myKeyboard.home
                }
            })
        break
}
    if(msg.location){
        console.log(msg.location); 
        getCinemasInCoord(chatId, msg.location)
    }

})

bot.onText(/\/start/, msg =>{
    const text = `Hello, ${msg.from.first_name}\nSelect a command to get started.. `
    bot.sendMessage(helpers.getChatId(msg),text,{
        reply_markup:{
           keyboard: myKeyboard.home
        }
    })
})

bot.on('callback_query', query => {

    const userId = query.from.id

    let data

    try{
        data = JSON.parse(query.data)
    }catch(e) {
        throw new Error('Data in not an object')
    }
    const { type } = data

    if (type === ACTION_TYPE.SHOW_CINEMAS_MAP){
        const {lat,  lon} = data
        bot.sendLocation(query.message.chat.id, lat, lon)
    } else if (type === ACTION_TYPE.SHOW_CINEMAS){
        sendCinemasByQuery(userId, {uuid: {'$in': data.cinemaUuids}})
    } else if (type === ACTION_TYPE.TOGGLE_FAV_FILM){
        toggleFavoriteFilm(userId, query.id, data)
    } else if (type === ACTION_TYPE.SHOW_FILMS){
        sendFilmsByQuery(userId, {uuid: {'$in': data.filmUuids}})
    }
})

bot.on('inline_query', query =>{
    Film.find({}).then(films =>{
        const results = films.map(f =>{
            const caption = `Name: ${f.name}\nYear: ${f.year}\nRate: ${f.rate}\nLength: ${f.length}\nCountry: ${f.country}`
            return {
                id: f.uuid,
                type: 'photo',
                photo_url: f.picture,
                thumb_url: f.picture,
                capiton: caption,
                reply_markup:{
                    inline_keyboard:[
                        [
                            {
                                text: `Kinopoisk ${f.name}`,
                                url: f.link
                            }
                        ]
                    ]
                }
            }
        })

        bot.answerInlineQuery(query.id, results, {
            cache_time: 0
        })
    })
})

bot.onText(/\/f(.+)/, (msg, [source, match]) => {
    const filmUuid = helpers.getItemUuid(source)
    const chatId = helpers.getChatId(msg)

    Promise.all([

        Film.findOne({uuid: filmUuid}),
        User.findOne({telegramID: msg.from.id })  

    ]).then(([film, user]) => {
       
        let isFav = false

        if (user) {
            isFav = user.films.indexOf(film.uuid) !== -1
        }

        const favText = isFav ? 'Dlete from favorite' : 'Add to favorite'

        const caption = `Name: ${film.name}\nYear: ${film.year}\nRate: ${film.rate}\nLength: ${film.length}\nCountry: ${film.country}`
       
        bot.sendPhoto(chatId, film.picture,{
           caption: caption,
           reply_markup: {
               inline_keyboard: [
                   [
                    {
                        text: favText,
                        callback_data: JSON.stringify({
                            type: ACTION_TYPE.TOGGLE_FAV_FILM,
                            filmUuid: film.uuid, 
                            isFav: isFav
                        })
                    },
                    {
                        text: 'Show cinemas',
                        callback_data: JSON.stringify({
                            type: ACTION_TYPE.SHOW_CINEMAS,
                            cinemaUuids: film.cinemas
                        })
                    }
                   ],
                   [
                    {
                        text: `Kinopoisk ${film.name}`,
                        url: film.link
                    }
                   ]
               ]
           }
        })
    })
})

bot.onText(/\/c(.+)/,(msg, [source, match]) => {
    const cinemaUuid = helpers.getItemUuid(source)
    const chatId = helpers.getChatId(msg)

    Cinema.findOne({uuid:cinemaUuid}).then(cinema => {

        bot.sendMessage(chatId, `Cinema ${cinema.name}`, {
            reply_markup: {
                inline_keyboard: [
                    [
                     {
                         text: cinema.name,
                         url: cinema.url
                     },
                     {
                         text: 'Show on the map',
                         callback_data: JSON.stringify({
                             type: ACTION_TYPE.SHOW_CINEMAS_MAP,
                             lat: cinema.location.latitude,
                             lon: cinema.location.longitude
                         })
                     }
                    ],
                    [
                     { 
                         text: 'Show movies',
                         callback_data: JSON.stringify({
                             type: ACTION_TYPE.SHOW_FILMS,
                             filmUuids: cinema.films
                         })
                     }
                    ]
                ]
            }
        })
    })
})


//========================================================================

function sendFilmsByQuery(chatId, query){

    Film.find(query).then(films  =>{
        
        const html = films.map((f, i) => {
           return `<b>${i + 1}</b> ${f.name} - /f${f.uuid}` 
        }).join('\n')
   
        sendHTML(chatId, html, 'films')
    }) 
    }

 function sendHTML(chatId, html, kbName = null){
    const options = {
        parse_mode: 'HTML'
    }

    if(kbName){
        options ['reply_markup'] = {
            keyboard: myKeyboard[kbName]
        }
    }

    bot.sendMessage(chatId, html, options)
 }

 function getCinemasInCoord(chatId, location){

    Cinema.find({}).then(cinemas =>{

        cinemas.forEach (c =>{ 
            c.distance = geolib.getDistance(location, c.location) / 1000
        })

        cinemas = _.sortBy(cinemas, 'distance')
        
        const html = cinemas.map((c,i) => {
            return `<b>${i + 1}</b> ${c.name}. <em>Distance</em> - <strong>${c.distance}</strong> km. /c${c.uuid}`
        }).join('\n')

        sendHTML(chatId, html, 'home')
    })
 }

let userPromise

 function toggleFavoriteFilm(userId, queryId, {filmUuid,isFav}){
    User.findOne({telegramID: userId})
    .then (user => {
        if (user) {
            if (isFav){
                user.films = user.films.filter(fUuid => fUuid !== filmUuid)
            } else {
                user.films.push(filmUuid)
            }
            userPromise = user
        } else {
            userPromise = new User ({
                telegramID: userId,
                films: [filmUuid]
            })
        }

        const answerText = isFav ? 'Deleted' : 'Added'

        userPromise.save().then(_ =>{
            bot.answerCallbackQuery ({
                callback_query_id: queryId,
                text: answerText
            })
        })
    })

 }

 function showFavoriteFilms(chatId,telegramID){
    User.findOne({telegramID})
    .then (user => {

        if(user) {
            Film.find({uuid: {'$in': user.films}}).then (films => {
                let html

                if(films.length) {
                    html = films.map((f, i) =>{
                        return `<b>${i + 1}</b> ${f.name} - <b>${f.rate}</b> (/f${f.uuid})` 
                    }).join('\n')
                } else {
                    html = 'Not added yet'
                }

                sendHTML(chatId,html, 'home')
            })
        } else {
            sendHTML (chatId, 'Not added yet', 'home')
        }
     })
 }

 

 function sendCinemasByQuery (userId, query){
    Cinema.find(query).then(cinemas =>{   
        const html = cinemas.map((c, i) => {
            return `<b>${i + 1}</b> ${c.name} - /c${c.uuid}`
        }).join('\n')

       //console.log(html);
        sendHTML(userId, html, 'home')
    })
 }
