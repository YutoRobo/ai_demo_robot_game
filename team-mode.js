// 1v1 / 2v2 battle mode. Injected inside the game closure by index.html.
const BATTLE_MODE_KEY='robot-ai-battle-v1-mode';
let battleMode='1v1';
try{const v=localStorage.getItem(BATTLE_MODE_KEY);if(v==='2v2')battleMode=v;}catch(_e){}
let teamBots=null,teamStates=null,teamBullets=[],teamMines=[];

const modeSection=document.createElement('div');modeSection.className='section';
modeSection.innerHTML='<strong>対戦モード</strong><div class="controls" style="margin-top:8px"><label class="mini">形式 <select id="battleModeSel"><option value="1v1">1v1</option><option value="2v2">2v2 チーム戦</option></select></label><span id="battleModeInfo" class="mini"></span></div><div class="mini" style="margin-top:6px">2v2では同チーム2機が同じAI・武器・機体設定を共有し、各機が最寄りの生存敵を狙います。</div>';
const chassisNode=root.querySelector('#chassisASel')?.closest('.section');
const modeAnchor=chassisNode||optimizeBtn.closest('.section');if(modeAnchor)modeAnchor.parentNode.insertBefore(modeSection,modeAnchor);
const battleModeSel=root.querySelector('#battleModeSel'),battleModeInfo=root.querySelector('#battleModeInfo');battleModeSel.value=battleMode;
function updateModeUi(){
  if(battleModeInfo)battleModeInfo.textContent=battleMode==='2v2'?'チーム全滅で決着 / 探索は1v1専用':'従来の1対1';
  optimizeBtn.disabled=battleMode==='2v2';
  optimizeBtn.title=battleMode==='2v2'?'高度探索は現在1v1モード専用です。':'';
}

function teamWeapon(side,slot){return side==='A'?(slot===0?weaponA1Sel.value:weaponA2Sel.value):(slot===0?weaponB1Sel.value:weaponB2Sel.value);}
function makeTeamBot(side,index,x,y,ang){
  const c=typeof chassisStats==='function'?chassisStats(side):{hp:100,move:1,strafe:1,turn:1};
  const ep=typeof equipmentPerformance==='function'?equipmentPerformance(side,teamWeapon(side,0),teamWeapon(side,1)):{move:1,strafe:1,turn:1};
  return{side,index,x,y,ang,hp:c.hp,maxHp:c.hp,moveMul:c.move*ep.move,strafeMul:c.strafe*ep.strafe,turnMul:c.turn*ep.turn,cd:0,r:18,killerReady:true,mineStock:3,ammo:{rifle:12,burst:6,heavy:5,rapid:28}};
}
function newTeamState(bot){return{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:bot.maxHp,hitRecent:0,lockTime:0};}
function living(side){return teamBots[side].filter(b=>b.hp>0);}
function nearestEnemy(bot){const es=living(bot.side==='A'?'B':'A');let best=null,bd=Infinity;for(const e of es){const d=Math.hypot(bot.x-e.x,bot.y-e.y);if(d<bd){bd=d;best=e;}}return best;}
function teamVision(me,op){if(!op)return{d:Infinity,signed:0,diff:Math.PI,narrow:false,medium:false,wide:false,any:false};const d=Math.hypot(me.x-op.x,me.y-op.y),to=Math.atan2(op.y-me.y,op.x-me.x),signed=norm(to-me.ang),diff=Math.abs(signed),los=!lineBlockedByObstacle(me,op);const narrow=los&&diff<=20*Math.PI/180&&d<=330,medium=los&&diff<=45*Math.PI/180&&d<=245,wide=los&&diff<=75*Math.PI/180&&d<=170;return{d,signed,diff,narrow,medium,wide,any:narrow||medium||wide};}
function teamCond(me,s,c){const op=nearestEnemy(me),v=teamVision(me,op);if(v.any)s.lastSeen=0;if(c==='enemyFront')return v.any&&v.diff<22*Math.PI/180;if(c==='enemyNear')return v.any&&v.d<150;if(c==='enemyFar')return v.any&&v.d>220;if(c==='enemyLeft')return v.any&&v.signed<0;if(c==='enemyRight')return v.any&&v.signed>0;if(c==='enemyInNarrowFov')return v.narrow;if(c==='enemyInMediumFov')return v.medium;if(c==='enemyInWideFov')return v.wide;if(c==='hpLow')return me.hp<.4*me.maxHp;if(c==='bulletNear')return teamBullets.some(q=>q.side!==me.side&&Math.hypot(q.x-me.x,q.y-me.y)<90);if(c==='bulletLeft'||c==='bulletRight'){let q=null,bd=Infinity;for(const x of teamBullets)if(x.side!==me.side){const d=Math.hypot(x.x-me.x,x.y-me.y);if(d<bd){bd=d;q=x;}}if(!q||bd>140)return false;const a=norm(Math.atan2(q.y-me.y,q.x-me.x)-me.ang);return c==='bulletLeft'?a<0:a>0;}if(c==='hitRecent')return s.hitRecent>0;if(c==='lostEnemy')return s.lastSeen>1;if(c==='flagSet')return s.flag;if(c==='timer2s')return s.timer>=2;if(c==='wallNear')return me.x<65||me.x>cv.width-65||me.y<65||me.y>cv.height-65||obstacles.some(o=>circleRectHit(me.x,me.y,58,o));if(c==='canShoot')return !!op&&me.cd<=0&&v.any&&v.diff<18*Math.PI/180;return false;}
function teamMove(o,f,st,t,dt){o.ang=norm(o.ang+t*2.1*(o.turnMul||1)*dt);const sp=105,ox=o.x,oy=o.y;o.x+=(Math.cos(o.ang)*f*(o.moveMul||1)+Math.cos(o.ang+Math.PI/2)*st*(o.strafeMul||1))*sp*dt;o.y+=(Math.sin(o.ang)*f*(o.moveMul||1)+Math.sin(o.ang+Math.PI/2)*st*(o.strafeMul||1))*sp*dt;o.x=Math.max(24,Math.min(cv.width-24,o.x));o.y=Math.max(24,Math.min(cv.height-24,o.y));if(obstacles.some(ob=>circleRectHit(o.x,o.y,o.r,ob))){o.x=ox;o.y=oy;}}
function teamFire(me,s,w){if(w==='mine'){if(me.cd<=0&&me.mineStock>0){me.mineStock--;me.cd=1.8;teamMines.push({x:me.x,y:me.y,side:me.side,r:20,damage:100});}return;}if(w==='killer'){if(me.killerReady&&me.cd<=0&&s.lockTime>=1.2){me.killerReady=false;s.lockTime=0;me.cd=1.1;teamBullets.push({x:me.x+Math.cos(me.ang)*24,y:me.y+Math.sin(me.ang)*24,vx:Math.cos(me.ang)*320,vy:Math.sin(me.ang)*320,side:me.side,life:2.1,damage:50,killer:true});}return;}if(me.cd>0||!me.ammo[w])return;let speed=320,damage=12,life=2.5,spread=[0],cool=.45;if(w==='burst'){speed=295;damage=8;life=2.2;spread=[-.055,0,.055];cool=.85;}else if(w==='heavy'){speed=225;damage=36;life=2.9;cool=1.35;}else if(w==='rapid'){speed=345;damage=4;life=1.9;cool=.16;}me.ammo[w]--;me.cd=cool;for(const da of spread){const a=me.ang+da;teamBullets.push({x:me.x+Math.cos(a)*24,y:me.y+Math.sin(a)*24,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,side:me.side,life,damage});}}
function teamAction(me,s,a){const op=nearestEnemy(me);if(a==='forward')teamMove(me,1,0,0,.12);else if(a==='back')teamMove(me,-.8,0,0,.12);else if(a==='turnL')teamMove(me,0,0,-1,.12);else if(a==='turnR')teamMove(me,0,0,1,.12);else if(a==='strafeL')teamMove(me,0,-.9,0,.12);else if(a==='strafeR')teamMove(me,0,.9,0,.12);else if(a==='weapon1')teamFire(me,s,teamWeapon(me.side,0));else if(a==='weapon2')teamFire(me,s,teamWeapon(me.side,1));else if(a==='flagOn')s.flag=true;else if(a==='flagOff')s.flag=false;else if(a==='timerStart')s.timer=0;else if(a==='aim'&&op){const v=teamVision(me,op);if(v.any)teamMove(me,0,0,Math.abs(v.signed)<.05?0:(v.signed>0?1:-1),.12);}else if(a==='evade'){let q=null,bd=Infinity;for(const x of teamBullets)if(x.side!==me.side){const d=Math.hypot(x.x-me.x,x.y-me.y);if(d<bd){bd=d;q=x;}}let ss=Math.random()<.5?1:-1;if(q){const aa=norm(Math.atan2(q.y-me.y,q.x-me.x)-me.ang);ss=aa<0?1:-1;}teamMove(me,0,ss,0,.12);}}
function teamExecute(me,s){const p=programs[me.side];if(s.pc===0){s.pc=1;return;}const c=p[s.pc];if(!c){s.pc=0;return;}if(c.kind==='action'){teamAction(me,s,c.type);s.pc=nextCell(s.pc,c.next);}else s.pc=nextCell(s.pc,teamCond(me,s,c.type)?c.yes:c.no);}
function resetTeamWorld(){
  obstacles=randomObstacles();const pts={A:[[95,145],[95,315]],B:[[625,145],[625,315]]};
  for(let tries=0;tries<30;tries++){let ok=true;for(const side of ['A','B'])for(const p of pts[side])if(obstacles.some(o=>circleRectHit(p[0],p[1],28,o)))ok=false;if(ok)break;obstacles=randomObstacles();}
  teamBots={A:pts.A.map((p,i)=>makeTeamBot('A',i,p[0],p[1],0)),B:pts.B.map((p,i)=>makeTeamBot('B',i,p[0],p[1],Math.PI))};
  teamStates={A:teamBots.A.map(newTeamState),B:teamBots.B.map(newTeamState)};teamBullets=[];teamMines=[];running=false;startBtn.textContent='戦闘開始';statusEl.textContent='2v2準備完了。各チーム2機が同じAIを共有します。';
}
function teamStep(dt){
  const period=typeof cpuDecisionPeriod==='function'?cpuDecisionPeriod():.12;
  for(const side of ['A','B'])for(let i=0;i<2;i++){const me=teamBots[side][i],s=teamStates[side][i];if(me.hp<=0)continue;const op=nearestEnemy(me),v=teamVision(me,op);me.cd=Math.max(0,me.cd-dt);s.timer+=dt;s.lastSeen=v.any?0:s.lastSeen+dt;s.hitRecent=Math.max(0,s.hitRecent-dt);s.lockTime=v.any&&v.diff<8*Math.PI/180?Math.min(1.5,s.lockTime+dt):Math.max(0,s.lockTime-dt*2);if(me.hp<s.lastHp)s.hitRecent=.8;s.lastHp=me.hp;s.acc+=dt;if(s.acc+1e-9>=period){s.acc=0;teamExecute(me,s);}}
  for(const q of teamBullets){q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;if(obstacles.some(o=>q.x>=o.x&&q.x<=o.x+o.w&&q.y>=o.y&&q.y<=o.y+o.h)){q.life=-1;continue;}for(const t of living(q.side==='A'?'B':'A'))if(q.life>0&&Math.hypot(q.x-t.x,q.y-t.y)<t.r+5){t.hp=Math.max(0,t.hp-q.damage);q.life=-1;break;}}
  teamBullets=teamBullets.filter(q=>q.life>0&&q.x>-20&&q.x<cv.width+20&&q.y>-20&&q.y<cv.height+20);
  for(let i=teamMines.length-1;i>=0;i--){const m=teamMines[i];for(const t of living(m.side==='A'?'B':'A'))if(Math.hypot(t.x-m.x,t.y-m.y)<t.r+m.r){t.hp=Math.max(0,t.hp-m.damage);teamMines.splice(i,1);break;}}
  if(!living('A').length||!living('B').length){running=false;startBtn.textContent='再戦';statusEl.textContent=!living('A').length&&!living('B').length?'2v2終了：引き分け':!living('B').length?'2v2終了：あなたのチーム勝利':'2v2終了：敵チーム勝利';}
}
function drawTeam(){
  ctx.clearRect(0,0,cv.width,cv.height);ctx.fillStyle='#20252b';ctx.fillRect(0,0,cv.width,cv.height);ctx.strokeStyle='#343b44';for(let x=40;x<cv.width;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,cv.height);ctx.stroke()}for(let y=40;y<cv.height;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cv.width,y);ctx.stroke()}
  for(const o of obstacles){ctx.fillStyle='#59616b';ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeStyle='#8b949f';ctx.strokeRect(o.x,o.y,o.w,o.h);}for(const side of ['A','B'])for(const b of teamBots[side])if(b.hp>0){drawAllFov(b,side==='A'?'rgba(79,163,255,ALPHA)':'rgba(240,92,97,ALPHA)');drawBot(b,side==='A'?'#4fa3ff':'#f05c61',`${side}${b.index+1}`);ctx.fillStyle='#fff';ctx.font='10px system-ui';ctx.fillText(`${Math.round(b.hp)}/${b.maxHp}`,b.x,b.y+32);}
  for(const m of teamMines){ctx.strokeStyle=m.side==='A'?'rgba(79,163,255,.65)':'rgba(240,92,97,.65)';ctx.beginPath();ctx.arc(m.x,m.y,m.r,0,Math.PI*2);ctx.stroke();}for(const q of teamBullets){ctx.fillStyle=q.killer?'#ffd54f':(q.side==='A'?'#8ec9ff':'#ff9da1');ctx.beginPath();ctx.arc(q.x,q.y,q.killer?7:5,0,Math.PI*2);ctx.fill();}
  const ah=teamBots.A.reduce((s,b)=>s+b.hp,0),am=teamBots.A.reduce((s,b)=>s+b.maxHp,0),bh=teamBots.B.reduce((s,b)=>s+b.hp,0),bm=teamBots.B.reduce((s,b)=>s+b.maxHp,0);hpAtext.textContent=`${Math.round(ah)} / ${Math.round(am)}`;hpBtext.textContent=`${Math.round(bh)} / ${Math.round(bm)}`;hpAbar.style.width=(100*ah/am)+'%';hpBbar.style.width=(100*bh/bm)+'%';fovAinfo.textContent='2機合計 / 各機3層視野';fovBinfo.textContent='2機合計 / 各機3層視野';renderProgram();
}
const baseResetTeam=resetWorld,baseStepTeam=step,baseDrawTeam=draw;
resetWorld=function(){if(battleMode==='2v2'){resetTeamWorld();drawTeam();renderProgram();return;}baseResetTeam();};
step=function(dt){if(battleMode==='2v2')return teamStep(dt);return baseStepTeam(dt);};
draw=function(){if(battleMode==='2v2'&&teamBots)return drawTeam();return baseDrawTeam();};

battleModeSel.addEventListener('change',()=>{battleMode=battleModeSel.value==='2v2'?'2v2':'1v1';try{localStorage.setItem(BATTLE_MODE_KEY,battleMode);}catch(_e){}updateModeUi();resetWorld();statusEl.textContent=battleMode==='2v2'?'2v2モードに切り替えました。チーム全滅で決着します。':'1v1モードに戻しました。';});
updateModeUi();if(battleMode==='2v2')setTimeout(()=>resetWorld(),0);
