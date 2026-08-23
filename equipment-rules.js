// Weapon load / equipment point rules. Injected inside the game closure by index.html.
const WEAPON_WEIGHT={rifle:3,burst:4,heavy:6,rapid:4,mine:5,killer:7};
const CHASSIS_CAPACITY={light:7,standard:9,heavy:13,multileg:10};
const weaponWeightName={rifle:'ライフル',burst:'バースト',heavy:'ヘビー弾',rapid:'速射砲',mine:'地雷',killer:'強化弾'};
function equipmentCapacity(side){return CHASSIS_CAPACITY[chassisBySide?.[side]]||9;}
function equipmentLoadForWeapons(w1,w2){return (WEAPON_WEIGHT[w1]||0)+(WEAPON_WEIGHT[w2]||0);}
function equipmentLoad(side){const w1=side==='A'?weaponA1Sel.value:weaponB1Sel.value,w2=side==='A'?weaponA2Sel.value:weaponB2Sel.value;return equipmentLoadForWeapons(w1,w2);}
function equipmentPerformance(side,w1,w2){
  const load=equipmentLoadForWeapons(w1,w2),capacity=equipmentCapacity(side),over=Math.max(0,load-capacity);
  return{load,capacity,over,move:Math.max(.65,1-.07*over),strafe:Math.max(.65,1-.07*over),turn:Math.max(.70,1-.06*over)};
}
const equipmentSection=document.createElement('div');equipmentSection.className='section';
equipmentSection.innerHTML='<strong>装備重量</strong><div id="equipmentInfo" class="mini" style="margin-top:7px"></div><div class="mini" style="margin-top:5px">重量: ライフル3 / バースト4 / ヘビー6 / 速射4 / 地雷5 / 強化弾7。積載超過1ptごとに移動・横移動-7%、旋回-6%（下限あり）。</div>';
const chassisSectionNode=root.querySelector('#chassisASel')?.closest('.section');const equipmentAnchor=chassisSectionNode||optimizeBtn.closest('.section');if(equipmentAnchor)equipmentAnchor.parentNode.insertBefore(equipmentSection,equipmentAnchor.nextSibling);
const equipmentInfo=root.querySelector('#equipmentInfo');
function equipmentSideText(side){const p=equipmentPerformance(side,side==='A'?weaponA1Sel.value:weaponB1Sel.value,side==='A'?weaponA2Sel.value:weaponB2Sel.value),name=side==='A'?'自機':'敵機';return`${name} ${p.load}/${p.capacity}pt${p.over>0?`（${p.over}pt超過・機動${Math.round(p.move*100)}%）`:'（適正）'}`;}
function updateEquipmentInfo(){if(equipmentInfo)equipmentInfo.textContent=equipmentSideText('A')+' / '+equipmentSideText('B');}
for(const sel of [weaponA1Sel,weaponA2Sel,weaponB1Sel,weaponB2Sel])sel.addEventListener('change',()=>{updateEquipmentInfo();resetWorld();statusEl.textContent='装備重量を更新しました。積載超過時は機動性が低下します。';});
if(typeof chassisASel!=='undefined'&&chassisASel)chassisASel.addEventListener('change',updateEquipmentInfo);
if(typeof chassisBSel!=='undefined'&&chassisBSel)chassisBSel.addEventListener('change',updateEquipmentInfo);
setTimeout(updateEquipmentInfo,0);
fetch('./team-mode.js?v=20260823-2124',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('team-mode.js '+r.status);return r.text();}).then(code=>eval(code)).catch(err=>console.error('team mode load failed',err));
