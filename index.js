const ENV = {
    ObsWebsocketAddress: 'localhost:4444',
    ObsWebsocketPassword: 'masterkey',
    ObsSourceName: 'Chat Bot Audio',
    TwitchUsername: 'sergiocabral_com',
    TwitchPassword: 'oauth:swulwzgr60gvfqekcb5nimw6cargdl',
    MediaSourceDirectory: 'D:\\OBS\\App.Twitch.ChatBotMedia\\videos',
    FileSentenceSeparator: ';',
    FileSentenceQuote: '\'',
    FileCheckInterval: 10000,
}

const path = require('path');
const fs = require('fs');
const tmi = require('tmi.js');
const OBSWebSocket = require('obs-websocket-js');

var global = {
    /**
     * @type {OBSWebSocket}
     */
    obs: null,

    /**
     * @type {tmi.Client}
     */
    irc: null,

    sentences: []
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
    const videoFileExtension = '.mp4';
    const directory = fs.realpathSync(ENV.MediaSourceDirectory);
    const files = fs
        .readdirSync(directory)
        .filter(file => file.toLowerCase().endsWith(videoFileExtension));
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
            const key = sentence.slug();
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
loadSentencesIfNecessary();

function filterSentenceFileData(message, messageKey, isQuoted) {
    const messageSlug = message.slug();
    if (isQuoted) {
        return messageSlug === messageKey;
    } else {
        return messageSlug.includes(messageKey);
    }
}

function findRandomSentenceFile(message) {
    const sentences = global.sentences;
    const sentenceKey = message.slug();
    const sentenceFilesData = sentences[sentenceKey]
        .filter(sentenceFileData => 
            filterSentenceFileData(
                message,
                sentenceFileData.key,
                sentenceFileData.isQuoted));
    
    const sentenceFilesDataRandomIndex = Math.floor(Math.random() * sentenceFilesData.length * 10) % sentenceFilesData.length;
    const sentenceFileData = sentenceFilesData[sentenceFilesDataRandomIndex];
    return sentenceFileData.fullpath;
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
    global.obs = await connectToObs();
    global.irc = await connectToTwitchChat();
    global.irc.on('message', onMessage);
}

main();