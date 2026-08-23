// Chassis type rules. Injected inside the game closure by index.html.
const CHASSIS_STORAGE_KEY='robot-ai-battle-v1-chassis';
const CHASSIS_TYPES={
  light:{name:'軽量型',hp:80,move:1.18,strafe:1.15,turn:1.15,desc:'高速・低耐久'},
  standard:{name:'標準型',hp:100,move:1.00,strafe:1.00,turn:1.00,desc:'バランス'},
  heavy:{name:'重装型',hp:140,move:.82,strafe:.80,turn:.82,desc:'高耐久・低速'},
  multileg:{name:'多脚型',hp:110,move:.95,strafe:1.25,turn:.78,desc:'横移動特化・旋回低下'}
};
let chassisBySide={A:'standard',B:'standard'};
try{const raw=localStorage.getItem(CHASSIS_STORAGE_KEY),saved=raw&&JSON.parse(raw);if(saved){if(CHASSIS_TYPES[saved.A])chassisBySide.A=saved.A;if(CHASSIS_TYPES[saved.B])chassisBySide.B=saved.B;}}catch(_e){}
function chassisStats(side){return CHASSIS_TYPES[chassisBySide[side]]||CHASSIS_TYPES.standard;}
function saveChassisSelection(){try{localStorage.setItem(CHASSIS_STORAGE_KEY,JSON.stringify(chassisBySide));}catch(_e){}}
const chassisSection=document.createElement('div');chassisSection.className='section';
chassisSection.innerHTML='<strong>機体タイプ</strong><div class="editor" style="margin-top:8px"><label>自機<select id="chassisASel"><option value="light">軽量型 / HP80 / 高速</option><option value="standard">標準型 / HP100</option><option value="heavy">重装型 / HP140 / 低速</option><option value="multileg">多脚型 / HP110 / 横移動特化</option></select></label><label>敵機<select id="chassisBSel"><option value="light">軽量型 / HP80 / 高速</option><option value="standard">標準型 / HP100</option><option value="heavy">重装型 / HP140 / 低速</option><option value="multileg">多脚型 / HP110 / 横移動特化</option></select></label></div><div id="chassisInfo" class="mini" style="margin-top:6px"></div>';
const cpuSectionNode=root.querySelector('#cpuClassSel')?.closest('.section');
const insertAnchor=cpuSectionNode||optimizeBtn.closest('.section');if(insertAnchor)insertAnchor.parentNode.insertBefore(chassisSection,insertAnchor.nextSibling);
const chassisASel=root.querySelector('#chassisASel'),chassisBSel=root.querySelector('#chassisBSel'),chassisInfo=root.querySelector('#chassisInfo');
chassisASel.value=chassisBySide.A;chassisBSel.value=chassisBySide.B;
function updateChassisInfo(){const a=chassisStats('A'),b=chassisStats('B');chassisInfo.textContent=`自機 ${a.name}: ${a.desc} / 敵機 ${b.name}: ${b.desc}`;}
function applyChassisChange(side,value){if(!CHASSIS_TYPES[value])return;chassisBySide[side]=value;saveChassisSelection();updateChassisInfo();resetWorld();statusEl.textContent=`${side==='A'?'自機':'敵機'}を${CHASSIS_TYPES[value].name}に変更しました。${CHASSIS_TYPES[value].desc}です。`;}
chassisASel.addEventListener('change',()=>applyChassisChange('A',chassisASel.value));
chassisBSel.addEventListener('change',()=>applyChassisChange('B',chassisBSel.value));
updateChassisInfo();
