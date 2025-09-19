export interface IDatabase extends Document {
    useruuid: string;
    username: string;
    discriminator: string;
}