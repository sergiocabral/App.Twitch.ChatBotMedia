/*
- Cliente Twitch IRC Client:
  - https://github.com/tmijs/tmi.js
- OBS Websocket
  - https://github.com/Palakis/obs-websocket/releases/tag/4.9.1
- Cliente OBS Websocket para JavaScript
  - https://github.com/obs-websocket-community-projects/obs-websocket-js
*/

const ENV = {
    ObsWebsocketAddress: 'localhost:4444',
    ObsWebsocketPassword: 'masterkey',
    ObsSourceName: 'Chat Bot Audio',
    TwitchUsername: 'sergiocabral_com',
    TwitchPassword: 'oauth:swulwzgr60gvfqekcb5nimw6cargdl',
    MediaSourceDirectory: 'D:\\OBS\\App.Twitch.ChatBotMedia\\videos',
    FileSentenceSeparator: ',',
    FileSentenceQuote: '\'',
    FileCheckInterval: 10000,
}

const path = require('path');
const fs = require('fs');
const tmi = require('tmi.js');
const OBSWebSocket = require('obs-websocket-js');

const global = {
    /**
     * @type {OBSWebSocket}
     */
    obs: null,

    /**
     * @type {tmi.Client}
     */
    irc: null,

    sentences: [],

    correlation: {
        'vc': 'você',
        'cê': 'você',
        'tu': 'você',
        'tô': 'estou',
        'tá': 'está',
        'tah': 'está',
        'doido': 'louco',
        'loco': 'louco',
        'loko': 'louco',
        'locura': 'loucura',
        'lokura': 'loucura',
        'num': 'não',
        'tendi': 'entendi',
        'intendi': 'entendi',
        'bixo': 'bicho',
        'coraegm': 'coragem',
        'tomá': 'tomar',
        'falô': 'falou',
        'pra': 'para',
        'va': 'vai',
        'é': 'eh',
        'vô': 'vou'
    }
};

String.prototype.removeAccents = function() {
    return this
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

String.prototype.slug = function() {
    const slugSeparator = '-';
    const regexNonAlphaNumeric = /[^a-z0-9]+/g;
    const regexDuplicateSeparator = /(^-+|-+$|-+(?=-))/g;
    return this
        .removeAccents()
        .toLowerCase()
        .replace(regexNonAlphaNumeric, slugSeparator)
        .replace(regexDuplicateSeparator, '');
}

function slugWithCorrelation(message) {
    message = message.slug();
    const correlation = global.correlation;
    for (let from of Object.keys(correlation)) {
        const to = correlation[from].slug();
        from = from.slug();
        message = message.replace(new RegExp('\\b' + from + '\\b', 'g'), to);
    }
    return message;
}

async function connectToObs() {
    const obs = new OBSWebSocket();
    await obs.connect({
        address: ENV.ObsWebsocketAddress,
        password: ENV.ObsWebsocketPassword,
    });
    console.log('Websocket connected.');
    return obs;
}

async function connectToTwitchChat() {
    const irc = new tmi.Client({
        identity: {
            username: ENV.TwitchUsername,
            password: ENV.TwitchPassword,
        },
        channels: [ ENV.TwitchUsername ]
    })
    await irc.connect();
    console.log('Twitch Chat connected.');
    return irc;
}

function getMedias() {
    const mediaFileExtensions = ['mp4', 'mp3'];
    const directory = fs.realpathSync(ENV.MediaSourceDirectory);
    const files = fs
        .readdirSync(directory)
        .filter(file => 
            mediaFileExtensions.filter(mediaFileExtension =>
                file.toLowerCase().endsWith(`.${mediaFileExtension}`)).length);
    return files
        .map(file => path.resolve(directory, file));
}

function loadSentencesDatabase(mediaFiles) {
    const result = { };
    mediaFiles.forEach(fullpath => {
        const filename = path.basename(fullpath);
        const sentences = filename.split(ENV.FileSentenceSeparator);
        sentences.forEach(sentence => {
            const regexFileExtension = /\.[^\.]*$/;
            sentence = sentence.trim().replace(regexFileExtension, '');
            const isQuoted = sentence[0] == ENV.FileSentenceQuote && sentence[sentence.length - 1] == ENV.FileSentenceQuote;
            if (isQuoted) sentence = sentence.substr(1, sentence.length - 2);
            const key = slugWithCorrelation(sentence);
            result[key] = result[key] || [];
            result[key].push({ key, isQuoted, fullpath });
        });
    })
    return result;
}

function loadSentencesIfNecessary() {
    const mediaFiles = getMedias();
    const signature = mediaFiles.join('');
    if (global.__loadSentencesIfNecessarySignature != signature) {
        global.__loadSentencesIfNecessarySignature = signature;
        global.sentences = loadSentencesDatabase(mediaFiles);
    }
    setTimeout(loadSentencesIfNecessary, ENV.FileCheckInterval);
}

function filterSentenceFileData(messageSlug, messageKey, isQuoted) {
    return (
        isQuoted
            ? messageSlug === messageKey
            : messageSlug.includes(messageKey)
    );
}

function getSentencesForKeys(possibleKeys) {
    const sentences = global.sentences;
    return possibleKeys
        .map(possibleKey => sentences[possibleKey])
        .reduce((result, sentenceFilesData) => {
            result.push(...sentenceFilesData);
            return result;
        }, []);
}

function getArrayRandomIndex(array) {
    return Math.floor(Math.random() * array.length * 10) % array.length;
}

function getArrayRandomValue(array) {
    return array[getArrayRandomIndex(array)];
}

function findRandomSentenceFile(message) {
    const sentences = global.sentences;
    const messageSlug = slugWithCorrelation(message);
    const possibleKeys = Object.keys(sentences).filter(sentenceKey => messageSlug.includes(sentenceKey));

    if (possibleKeys.length === 0) return undefined;

    const sentenceFilesData = getSentencesForKeys(possibleKeys)
        .filter(sentenceFileData => 
            filterSentenceFileData(messageSlug, sentenceFileData.key, sentenceFileData.isQuoted));
    
    return getArrayRandomValue(sentenceFilesData).fullpath;
}

async function tryPlayMessageAsMedia(message) {
    const obs = global.obs;
    const sentenceFileFullpath = findRandomSentenceFile(message);
    if (sentenceFileFullpath) {
        await obs.send(
            'SetSourceSettings', {
                sourceName: ENV.ObsSourceName,
                sourceSettings: { local_file: sentenceFileFullpath }
        });
    }
}

async function onMessage(channel, tags, message, self) {
    await tryPlayMessageAsMedia(message);
}

async function main() {
    loadSentencesIfNecessary();
    global.obs = await connectToObs();
    global.irc = await connectToTwitchChat();
    global.irc.on('message', onMessage);
}

main();