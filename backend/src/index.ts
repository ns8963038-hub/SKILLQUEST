import 'dotenv/config'; // load .env into process.env before anything reads it
import { createApp } from './app';
import { env } from './env';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`SkillQuest API listening on http://localhost:${env.PORT}`);
});
