import {PromptConfig} from './PromptConfig';

/**
 * {@link PromptTypeConfig PromptTypeConfig.ts}
 *
 * Stores a powerup prompt type configuration for a bot instance.
 *
 * @license {@link http://www.apache.org/licenses/ Apache-2.0}
 * @copyright WeslayCodes 2023
 */

export class PromptTypeConfig {
    readonly [promptKey: string]: PromptConfig | string | number;

    public readonly name: string = ' ';
    public readonly description: string = ' ';
    public readonly rightStyle: number = 0;
    public readonly wrongStyle: number = 0;
}