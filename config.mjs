import fs from 'node:fs';
const local=new URL('./config.local.json',import.meta.url);
export const config=JSON.parse(fs.readFileSync(fs.existsSync(local)?local:new URL('./config.example.json',import.meta.url),'utf8'));
