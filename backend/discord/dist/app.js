"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.discord = void 0;
var discord_js_1 = require("discord.js");
var axios_1 = require("axios");
var toad_scheduler_1 = require("toad-scheduler");
var events_1 = require("./events");
var config_1 = require("../config");
var DiscordService_1 = require("../core/services/DiscordService");
var _a = config_1.CONFIG.discord, discordToken = _a.token, logOutputChannelID = _a.logOutputChannelId, clientId = _a.clientId;
var _b = config_1.CONFIG.botListAuth, discordbotlist = _b.discordbotlist, topgg = _b.topgg;
var scheduler = new toad_scheduler_1.ToadScheduler();
var discordService = DiscordService_1.DiscordService.getInstance();
exports.discord = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.DirectMessages,
        discord_js_1.GatewayIntentBits.DirectMessageTyping,
    ],
    partials: [discord_js_1.Partials.Message, discord_js_1.Partials.Channel, discord_js_1.Partials.Reaction],
    failIfNotExists: false,
    sweepers: {
        messages: {
            interval: 300,
            lifetime: 600
        }
    }
});
var getHeaders = function (key) { return ({
    headers: {
        Authorization: key
    }
}); };
var globalSlashCommands = [
    {
        name: "roll",
        description: "Throws some dice",
        options: [
            {
                name: "notation",
                required: true,
                description: "Dice notation, e.g. 1d6+2",
                type: discord_js_1.ApplicationCommandOptionType.String
            },
            {
                name: "title",
                description: "What is this roll for? e.g. attack with enchanted sword",
                type: discord_js_1.ApplicationCommandOptionType.String
            },
            {
                name: "timestorepeat",
                description: "If you would like to repeat this roll, enter the number of times here.",
                type: discord_js_1.ApplicationCommandOptionType.String
            },
        ]
    },
    {
        name: "status",
        description: "Pings Dice Witch"
    },
    {
        name: "knowledgebase",
        description: "Shows the Dice Witch knowledgebase",
        options: [
            {
                name: "topic",
                required: true,
                description: "what you want to know about",
                type: discord_js_1.ApplicationCommandOptionType.String,
                choices: [
                    { name: "Exploding dice", value: "exploding" },
                    { name: "Auto-reroll", value: "reroll" },
                    { name: "Keep/drop AKA advantage", value: "keepdrop" },
                    { name: "Target success/failure AKA Dice pool", value: "target" },
                    { name: "Critical success/failure", value: "crit" },
                    { name: "Sorting", value: "sort" },
                    { name: "Math", value: "math" },
                    { name: "Repeating", value: "repeating" },
                ]
            },
        ]
    },
    {
        name: "help",
        description: "List all commands or info about a specific command",
        options: [
            {
                name: "command",
                description: "The command to get help for",
                type: discord_js_1.ApplicationCommandOptionType.String,
                required: false
            }
        ]
    },
];
var registerCommands = function (discord) { return __awaiter(void 0, void 0, void 0, function () {
    var channel, err_1;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 3, , 4]);
                return [4 /*yield*/, discord.channels.fetch(logOutputChannelID)];
            case 1:
                channel = _b.sent();
                console.log("[Discord] Found log output channel " + (channel === null || channel === void 0 ? void 0 : channel.name));
                console.log("[Discord] Registering global slash commands...");
                return [4 /*yield*/, ((_a = discord.application) === null || _a === void 0 ? void 0 : _a.commands.set(globalSlashCommands))];
            case 2:
                _b.sent();
                console.log("[Discord] Registered.");
                return [2 /*return*/, channel];
            case 3:
                err_1 = _b.sent();
                console.error("Error registering commands:", err_1);
                return [2 /*return*/, null];
            case 4: return [2 /*return*/];
        }
    });
}); };
var createBotSiteUpdateTask = function (discord) {
    return new toad_scheduler_1.AsyncTask("botsite updates", function () { return __awaiter(void 0, void 0, void 0, function () {
        var totalGuilds, promises;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, discordService.getUserCount({ discord: discord })];
                case 1:
                    totalGuilds = ((_a = _b.sent()) !== null && _a !== void 0 ? _a : {}).totalGuilds;
                    promises = [
                        axios_1["default"].post("https://top.gg/api/bots/" + clientId + "/stats", { server_count: totalGuilds }, getHeaders(topgg)),
                        axios_1["default"].post("https://discordbotlist.com/api/v1/bots/" + clientId + "/stats", { guilds: totalGuilds }, getHeaders(discordbotlist)),
                    ];
                    return [4 /*yield*/, Promise.all(promises)];
                case 2:
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    }); }, function (err) {
        console.error("Error updating bot site stats:", err);
    });
};
var startServer = function () {
    exports.discord.on("ready", function () { return __awaiter(void 0, void 0, void 0, function () {
        var discordService, logOutputChannel, task, job;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    discordService = DiscordService_1.DiscordService.getInstance();
                    discordService.setClient(exports.discord);
                    if (exports.discord.user) {
                        exports.discord.user.setActivity("/roll");
                    }
                    return [4 /*yield*/, registerCommands(exports.discord)];
                case 1:
                    logOutputChannel = _a.sent();
                    if (!logOutputChannel) return [3 /*break*/, 3];
                    return [4 /*yield*/, events_1["default"](exports.discord, logOutputChannel)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    console.error("Log output channel not found.");
                    _a.label = 4;
                case 4:
                    task = createBotSiteUpdateTask(exports.discord);
                    job = new toad_scheduler_1.SimpleIntervalJob({ hours: 4 }, task);
                    scheduler.addSimpleIntervalJob(job);
                    return [2 /*return*/];
            }
        });
    }); });
    exports.discord.login(discordToken);
    exports.discord.on('shardReady', function (shardId) {
        console.log("Shard " + shardId + " ready");
    });
};
startServer();
