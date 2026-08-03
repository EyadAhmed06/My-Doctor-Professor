import { spawn } from "node:child_process";
const args=process.argv.slice(2);
const value=(flag,fallback)=>{const i=args.indexOf(flag);return i>=0&&args[i+1]?args[i+1]:fallback};
// NestJS owns port 3000. Keep the frontend on 3001 so browser requests reach
// the API instead of being routed back into Next.js.
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","-H",value("--host","0.0.0.0"),"-p",value("--port",process.env.FRONTEND_PORT||"3001")],{stdio:"inherit"});
child.on("exit",code=>process.exit(code??0));
