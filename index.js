const path = require('path');
const fs = require('fs');
const tmi = require('tmi.js');
const OBSWebSocket = require('obs-websocket-js');

const global = {
    obs: null,
    irc: null,
    environment: require('./env.json'),
    sentences: { },
    correlations: { },
};

function requireWithoutCache(module) {
    fs.watchFile(path.resolve(module), () =>
        delete require.cache[require.resolve(module)]);
    return require(module);
}

String.prototype.removeAccents = function() {
    return this
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
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

function slugWithCorrelationReplacement(message) {
    message = message.slug();
    const correlations = global.correlations;
    for (let from of Object.keys(correlations)) {
        const to = correlations[from].slug();
        from = from.slug();
        const regexIsolatedWordFrom = new RegExp('\\b' + from + '\\b', 'g');
        message = message.replace(regexIsolatedWordFrom, to);
    }
    return message;
}

async function connectToObs() {
    const obs = new OBSWebSocket();
    await obs.connect({
        address: global.environment.ObsWebsocketAddress,
        password: global.environment.ObsWebsocketPassword,
    });
    console.log('Websocket connected.');
    return obs;
}

async function connectToTwitchChat() {
    const irc = new tmi.Client({
        identity: {
            username: global.environment.TwitchUsername,
            password: global.environment.TwitchPassword,
        },
        channels: [ global.environment.TwitchUsername ]
    })
    await irc.connect();
    console.log('Twitch Chat connected.');
    return irc;
}

function getMedias() {
    const mediaFileExtensions = ['mp4', 'mp3'];
    const directory = fs.realpathSync(global.environment.MediaSourceDirectory);
    const files = fs
        .readdirSync(directory)
        .filter(file => 
            mediaFileExtensions.filter(mediaFileExtension =>
                file.toLowerCase().endsWith(`.${mediaFileExtension}`)).length);
    return files.map(file => path.resolve(directory, file));
}

function factorySentencesDatabase(mediaFiles) {
    const result = { };
    mediaFiles.forEach(fullpath => {
        const filename = path.basename(fullpath);
        const sentences = filename.split(global.environment.FileSentenceSeparator);
        sentences.forEach(sentence => {
            const regexFileExtension = /\.[^\.]*$/;
            sentence = sentence.trim().replace(regexFileExtension, '');
            const isQuoted = sentence[0] == global.environment.FileSentenceQuote && sentence[sentence.length - 1] == global.environment.FileSentenceQuote;
            if (isQuoted) sentence = sentence.substr(1, sentence.length - 2);
            const key = slugWithCorrelationReplacement(sentence);
            result[key] = result[key] || [];
            result[key].push({ key, isQuoted, fullpath });
        });
    })
    return result;
}

function loadSentences() {
    const mediaFiles = getMedias();
    const signature = mediaFiles.join('');
    if (global.__loadSentencesSignature != signature) {
        global.__loadSentencesSignature = signature;

        global.correlations = requireWithoutCache('./correlation.json');
        console.log(`Correlations loaded:\n${Object.keys(global.correlations).sort((a, b) => a.slug().localeCompare(b.slug())).map(correlation => `  ${correlation} => ${global.correlations[correlation]}`).join('\n')}`);

        global.sentences = factorySentencesDatabase(mediaFiles);
        console.log(`Sentences loaded:\n${Object.keys(global.sentences).sort().map(sentence => `  ${sentence}: ${global.sentences[sentence].length} files`).join('\n')}`);
    }
    setTimeout(loadSentences, global.environment.FileCheckInterval);
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
    const messageSlug = slugWithCorrelationReplacement(message);
    const possibleKeys = Object.keys(sentences).filter(sentenceKey => messageSlug.includes(sentenceKey));

    const sentenceFilesData = getSentencesForKeys(possibleKeys)
        .filter(sentenceFileData => 
            filterSentenceFileData(messageSlug, sentenceFileData.key, sentenceFileData.isQuoted));
    
    return getArrayRandomValue(sentenceFilesData)?.fullpath;
}

async function playMediaIntoOBS(filePath, sourceName) {
    const obs = global.obs;
    await obs.send(
        'SetSourceSettings', {
            sourceName: sourceName,
            sourceSettings: { local_file: filePath }
    });
}

async function tryPlayMessageAsMedia(message) {
    const sentenceFileFullpath = findRandomSentenceFile(message);
    if (sentenceFileFullpath) {
        console.log(`Message: ${message}`);
        await playMediaIntoOBS(sentenceFileFullpath, global.environment.ObsSourceName);
        console.log(`Play file: ${path.basename(sentenceFileFullpath)}`);
    }
}

async function playNotifySound() {
    const notifySoundFileFullpath = fs.realpathSync(global.environment.NotificationFilename);
    await playMediaIntoOBS(notifySoundFileFullpath, global.environment.NotificationObsSourceName);
}

async function onMessage(channel, tags, message, self) {
    await tryPlayMessageAsMedia(message);
    await playNotifySound();
}

async function main() {
    loadSentences();
    global.obs = await connectToObs();
    global.irc = await connectToTwitchChat();
    global.irc.on('message', onMessage);
}

main();