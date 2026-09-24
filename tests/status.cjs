const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../config_builder/static/app.js'),'utf8');
const assess = new Function(source.slice(source.indexOf('function assessConfiguration('),source.indexOf('\nfunction configurationStatus')) + '; return assessConfiguration;')();
const base = {foilMaterial:'foil',template:'template',stackId:'00005',operator:'alice',lasers:[{enabled:true,isDefault:false}],fields:[],layers:['F1'],repeat:1,wraparound:true};
assert.equal(assess(base).status,'Complete');
assert.equal(assess({...base,stackId:''}).status,'Incomplete');
assert.equal(assess({...base,lasers:[{enabled:false}]}).status,'Incomplete');
assert.equal(assess({...base,fields:[{name:'',value:'3'}]}).status,'Incomplete');
for(const stackId of ['F123','F1234','0AZ9Z']) assert.equal(assess({...base,stackId}).status,'Complete');
for(const stackId of ['bad id','OOOOO','F12']) assert.equal(assess({...base,stackId}).status,'Needs validation');
for(const changes of [{operator:''},{lasers:[{enabled:true,isDefault:true}]},{wraparound:false,layers:['F1','F2']},{lasers:[{enabled:true},{enabled:false}]},{lasers:[{enabled:true},{enabled:true}]},{fields:[{name:'thickness',value:''}]}]) assert.equal(assess({...base,...changes}).status,'Needs validation');
assert.equal(assess({...base,fields:[{name:'',value:''}]}).status,'Complete');
console.log('Status requirements, all six warnings, and legacy/Crockford formats passed.');
const confirmBody = source.slice(source.indexOf('function confirmExport()'), source.indexOf('\nasync function changeTemplate'));
function checkGate(result, decision) {
  let prompts = 0;
  const gate = new Function('validate','configurationStatus','$','toast','confirm', confirmBody + '; return confirmExport;')(
    () => result.complete, () => result, () => ({click(){}, scrollIntoView(){}, focus(){}, checked: decision}), () => {}, () => {prompts++; return decision;});
  return [gate(), prompts];
}
assert.deepEqual(checkGate(assess({...base,stackId:''}),true),[false,0]);
assert.deepEqual(checkGate(assess({...base,operator:''}),false),[false,0]);
assert.deepEqual(checkGate(assess({...base,operator:''}),true),[true,0]);
assert.deepEqual(checkGate(assess(base),true),[true,0]);
console.log('Export gate blocks incomplete data and requires warning confirmation.');

assert.equal(assess({...base,foilMaterial:""}).status,"Incomplete");
assert.equal(assess({...base,template:""}).status,"Incomplete");
assert.equal(assess(base).violations.length,0);
assert.equal(assess({...base,operator:""}).violations[0].target,"#operator");

assert.equal(assess({...base,duplicateStack:true}).status,'Needs validation');
assert.equal(assess({...base,duplicateStack:true}).violations[0].target,'#stackid');
assert.deepEqual(checkGate(assess({...base,duplicateStack:true}),false),[false,0]);

for (const stackState of ['generated','registered','restricted']) {
  const blocked = assess({...base,duplicateStack:true,stackState});
  assert.equal(blocked.status, 'Incomplete');
  assert.deepEqual(checkGate(blocked,true),[false,0]);
}

const restore = new Function(source.slice(source.indexOf('function restoreImportedLaser'),source.indexOf('function normalizeLayerNames')) + '; return restoreImportedLaser;')();
const imported = {enabled:false,locked:false,power:12,importOriginal:{power:60}};
restore(imported);
assert.equal(imported.enabled,true);
assert.equal(imported.locked,true);
assert.equal(imported.power,60);
assert.equal(assess({...base,presetFields:['glass_tl_mm']}).status,'Incomplete');
assert.equal(assess({...base,presetFields:['glass_tl_mm'],fields:[{name:'glass_tl_mm',value:''}]}).status,'Needs validation');
