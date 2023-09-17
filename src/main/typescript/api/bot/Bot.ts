import {BotConfig} from '../../bot/config/BotConfig';
import {Command} from '../commands/Command';
import {Client} from 'discord.js';
import {Subcommand} from '../commands/Subcommand';
import {PowerupSpawner} from '../../feat/PowerupSpawner';

/**
 * {@link Bot Bot.ts}
 *
 * An interface used to handle a new bot.
 *
 * @license {@link http://www.apache.org/licenses/ Apache-2.0}
 * @copyright WeslayCodes 2023
 */
export interface Bot {
    buildClient(): void;
    getClient(): Client;
    loadConfig(firstLoad: boolean): void;
    getConfig(): BotConfig;
    getConfigHash(): string;
    registerCommands(): void;
    getCommands(): Map<string, Command>;
    getSubcommands(): Map<string, Subcommand>;
    deployCommands(): void;
    registerListeners(): void;
    getPowSpawner(): PowerupSpawner;
    onStart(): void;
    login(): void;
}