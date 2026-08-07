import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import path from 'path';

const root=process.cwd();
const backupRoot=path.resolve(process.env.BACKUP_DIR||path.join(root,'backups'));
const uploadRoot=path.resolve(process.env.FILE_UPLOAD_PATH||path.join(root,'uploads'));
const retentionDays=Number(process.env.BACKUP_RETENTION_DAYS||14);
const db={host:process.env.DB_HOST||'localhost',port:process.env.DB_PORT||'5432',user:process.env.DB_USERNAME||'postgres',name:process.env.DB_NAME||'my_doctor_professor',password:process.env.DB_PASSWORD||''};
if(!Number.isFinite(retentionDays)||retentionDays<1)throw new Error('BACKUP_RETENTION_DAYS must be at least 1');

const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const snapshot=path.join(backupRoot,`${db.name}-${stamp}`);
const dumpPath=path.join(snapshot,'database.dump');
const filesPath=path.join(snapshot,'uploads');

function run(command,args,env={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:'inherit',env:{...process.env,...env}});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve():reject(new Error(`${command} exited with code ${code}`)));
  });
}
async function sha256(file){const data=await readFile(file);return createHash('sha256').update(data).digest('hex');}
async function fileManifest(directory){
  const result=[];
  async function walk(current){
    let entries=[];try{entries=await readdir(current,{withFileTypes:true});}catch(error){if(error?.code==='ENOENT')return;throw error;}
    for(const entry of entries){const full=path.join(current,entry.name);if(entry.isDirectory())await walk(full);else if(entry.isFile()){const details=await stat(full);result.push({path:path.relative(directory,full).replaceAll(path.sep,'/'),size:details.size,sha256:await sha256(full)});}}
  }
  await walk(directory);return result.sort((a,b)=>a.path.localeCompare(b.path));
}

await mkdir(snapshot,{recursive:true});
console.log(`Creating PostgreSQL backup at ${dumpPath}`);
await run('pg_dump',['--format=custom','--no-owner','--no-privileges','--host',db.host,'--port',String(db.port),'--username',db.user,'--file',dumpPath,db.name],{PGPASSWORD:db.password});

try{await stat(uploadRoot);await cp(uploadRoot,filesPath,{recursive:true,errorOnExist:false});}catch(error){if(error?.code!=='ENOENT')throw error;await mkdir(filesPath,{recursive:true});}
const uploads=await fileManifest(filesPath);
const metadata={format:1,created_at:new Date().toISOString(),database:{host:db.host,port:Number(db.port),name:db.name,dump:'database.dump',sha256:await sha256(dumpPath)},uploads:{source:uploadRoot,count:uploads.length,files:uploads}};
await writeFile(path.join(snapshot,'manifest.json'),JSON.stringify(metadata,null,2)+'\n',{mode:0o600});

const cutoff=Date.now()-retentionDays*86_400_000;
await mkdir(backupRoot,{recursive:true});
for(const entry of await readdir(backupRoot,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  const full=path.join(backupRoot,entry.name);if(full===snapshot)continue;
  const details=await stat(full);if(details.mtimeMs<cutoff){console.log(`Removing expired backup ${entry.name}`);await rm(full,{recursive:true,force:true});}
}
console.log(JSON.stringify({snapshot,database_dump:dumpPath,upload_files:uploads.length,retention_days:retentionDays},null,2));
