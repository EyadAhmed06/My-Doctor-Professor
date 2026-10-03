import { spawn } from 'child_process';
import { cp, mkdir, readFile, rm } from 'fs/promises';
import path from 'path';

const rawSnapshot=process.env.BACKUP_SNAPSHOT||process.argv[2];
if(!rawSnapshot)throw new Error('Provide BACKUP_SNAPSHOT or a snapshot path argument');
if(process.env.RESTORE_MODE!=='replace')throw new Error('Set RESTORE_MODE=replace to acknowledge this operation replaces database objects and managed uploads.');
if(process.env.NODE_ENV==='production'&&process.env.CONFIRM_PRODUCTION_RESTORE!=='I_UNDERSTAND_THIS_REPLACES_DATA')throw new Error('Production restore blocked. Set CONFIRM_PRODUCTION_RESTORE=I_UNDERSTAND_THIS_REPLACES_DATA only during an approved recovery.');
const snapshot=path.resolve(rawSnapshot);
const manifest=JSON.parse(await readFile(path.join(snapshot,'manifest.json'),'utf8'));
const db={host:process.env.DB_HOST||'localhost',port:process.env.DB_PORT||'5432',user:process.env.DB_USERNAME||'postgres',name:process.env.DB_NAME||manifest.database.name,password:process.env.DB_PASSWORD||''};
const uploadRoot=path.resolve(process.env.FILE_UPLOAD_PATH||path.join(process.cwd(),'uploads'));
function run(command,args,env={}){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env:{...process.env,...env}});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${command} exited with code ${code}`)));});}
console.log(`Restoring ${manifest.database.name} snapshot created ${manifest.created_at} into ${db.name}`);
await run('pg_restore',['--clean','--if-exists','--no-owner','--no-privileges','--host',db.host,'--port',String(db.port),'--username',db.user,'--dbname',db.name,path.join(snapshot,manifest.database.dump)],{PGPASSWORD:db.password});
await rm(uploadRoot,{recursive:true,force:true});await mkdir(uploadRoot,{recursive:true});await cp(path.join(snapshot,'uploads'),uploadRoot,{recursive:true,errorOnExist:false});
console.log(JSON.stringify({restored:true,target_database:db.name,upload_path:uploadRoot,source_snapshot:snapshot},null,2));
