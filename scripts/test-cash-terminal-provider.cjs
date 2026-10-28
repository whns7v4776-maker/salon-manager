// Run the framework-free provider cases under Node as well as Deno. No network,
// credentials or live payment operations are required.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const compiled=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const terminal={exports:{}};
vm.runInNewContext(compiled(fs.readFileSync('supabase/functions/_shared/cash-terminal.ts','utf8')),{module:terminal,exports:terminal.exports,Date});
const cases=[];
const assertion={assertEquals:assert.deepStrictEqual,assertRejects:assert.rejects,assertThrows:assert.throws};
vm.runInNewContext(compiled(fs.readFileSync('supabase/functions/_shared/cash-terminal.test.ts','utf8')),{exports:{},Deno:{test:(name,job)=>cases.push([name,job])},require:name=>name.startsWith('https:')?assertion:terminal.exports,Date});
(async()=>{for(const [name,job] of cases){await job();console.log(`PASS ${name}`);}})().catch(error=>{console.error(error);process.exitCode=1;});
