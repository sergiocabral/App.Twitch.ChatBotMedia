const path = require('path');
const fs = require('fs');
const tmi = require('tmi.js');
const OBSWebSocket = require('obs-websocket-js');

process.chdir(__dirname);

const global = {
    obs: null,
    irc: null,
    environment: require('./env.json'),
    sentences: { },
    correlations: { },
    playing: {},
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
    console.log(`Connecting to OBS in ${global.environment.ObsWebsocketAddress}.`);
    const obs = new OBSWebSocket();
    try {
        await obs.connect({
            address: global.environment.ObsWebsocketAddress,
            password: global.environment.ObsWebsocketPassword,
        });
    } catch (error) {
        console.error("Error when try to connect OBS: " + JSON.stringify(error));
        throw error;
    }
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
    const possibleKeys = Object.keys(sentences).filter(sentenceKey =>
        new RegExp('\\b' + sentenceKey + '\\b').test(messageSlug));

    const sentenceFilesData = getSentencesForKeys(possibleKeys)
        .filter(sentenceFileData =>
            filterSentenceFileData(messageSlug, sentenceFileData.key, sentenceFileData.isQuoted));

    return getArrayRandomValue(sentenceFilesData)?.fullpath;
}

async function playMediaIntoOBS(filePath, sourceName, timeout = 20000) {
    const obs = global.obs;
    try {
        clearTimeout(global.playing[sourceName]);
        await obs.send(
            'SetSourceSettings', {
                sourceName: sourceName,
                sourceSettings: { local_file: filePath }
        });
        global.playing[sourceName] = setTimeout(() => obs.send(
            'SetSourceSettings', {
                sourceName: sourceName,
                sourceSettings: { local_file: `${filePath}-not-exists` }
        }), timeout);
    } catch (error) {
        console.error(`Cannot play media into OBS. Source "${sourceName}" maybe  exists.`);
    }
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
    await playMediaIntoOBS(notifySoundFileFullpath, global.environment.NotificationObsSourceName, 1000);
}

async function onMessage(channel, tags, message, self) {
    await tryPlayMessageAsMedia(message);
    await playNotifySound();
}

let recognizeVoiceTry = 10;
function recognizeVoice() {
    const outputVoiceFileName = "voice.txt"
    const outputVoiceFilePath = path.join(__dirname, outputVoiceFileName);

    if (!fs.existsSync(outputVoiceFilePath)) {
        console.log(`Reconhecimento de voz não encontrado: ${outputVoiceFilePath}`);
        if (recognizeVoiceTry-- > 0) {
            setTimeout(recognizeVoice, 10000);
        }
        return;
    }
    console.log(`Reconhecimento de voz ativado: ${outputVoiceFilePath}`);

    const outputVoiceFile = fs.openSync(outputVoiceFilePath, 'r');
    let lastSize = 0;
    let first = true;
    let playMeme = false;
    fs.watchFile(outputVoiceFilePath, (curr, prev) => {
        if (curr.mtime <= prev.mtime) {
            return;
        }

        const currentSize = fs.fstatSync(outputVoiceFile).size;
        const bufferSize = currentSize - lastSize;
        const buffer = Buffer.alloc(currentSize);
        const bytesRead = fs.readSync(outputVoiceFile, buffer, lastSize, bufferSize);
        const content = buffer.toString().trim();

        playMeme = content.includes("meme");

        if (!first && content && playMeme) {
            playMeme = false;
            console.log(`Conteúdo recebido:\n---\n${content}\n---\n`);
            const messages = content.match(/(?<=RECOGNIZED: ).*$/gm) ?? [];
            for (const message of messages) {
                console.log(`Voice message: ${message}`);
                tryPlayMessageAsMedia(message.slug().replace(/-/g, ' '));
            }
        }

        first = false;
        lastSize = currentSize;
    });
}

async function main() {
    loadSentences();
    recognizeVoice();
    global.obs = await connectToObs();
    global.irc = await connectToTwitchChat();
    global.irc.on('message', onMessage);
}

main();