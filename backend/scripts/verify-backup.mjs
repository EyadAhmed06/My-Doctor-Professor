import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';

const snapshot=path.resolve(process.env.BACKUP_SNAPSHOT||process.argv[2]||'');
if(!snapshot||snapshot===path.parse(snapshot).root)throw new Error('Provide BACKUP_SNAPSHOT or a snapshot path argument');
const manifest=JSON.parse(await readFile(path.join(snapshot,'manifest.json'),'utf8'));
async function sha256(file){return createHash('sha256').update(await readFile(file)).digest('hex');}
const dump=path.join(snapshot,manifest.database.dump);
if(await sha256(dump)!==manifest.database.sha256)throw new Error('Database dump checksum mismatch');
for(const item of manifest.uploads.files){const full=path.join(snapshot,'uploads',item.path);if(await sha256(full)!==item.sha256)throw new Error(`Upload checksum mismatch: ${item.path}`);}
console.log(JSON.stringify({verified:true,snapshot,created_at:manifest.created_at,database:manifest.database.name,upload_files:manifest.uploads.count},null,2));
