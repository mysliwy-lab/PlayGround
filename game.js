(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, T = 48, COLS = 20, ROWS = 12;
  const $ = (s) => document.querySelector(s);
  const ui = { coins: $('#coin-count'), ore: $('#ore-count'), hearts: $('#hearts'), hp: $('#health-value'), xp: $('#xp-value'), xpFill: $('#xp-fill'), spiders: $('#spider-count'), oreObj: $('#ore-objective'), spiderCheck: $('#spider-check'), oreCheck: $('#ore-check'), liftCheck: $('#lift-check'), toast: $('#toast'), over: $('#game-over'), victory: $('#victory'), floor: $('#floor-label'), depth: $('#depth-label'), hint: $('#start-hint') };
  const keys = new Set();
  const state = { floor: 1, coins: 0, ore: 0, hp: 5, xp: 0, kills: 0, veinsMined: 0, dead: false, won: false, t: 0, lastAttack: -10, lastMine: -10, lastDamage: -10, shake: 0, particles: [], loot: [], facing: {x: 1, y: 0}, moving: false, sound: true };
  const map = Array.from({length: ROWS}, (_, y) => Array.from({length: COLS}, (_, x) => x === 0 || y === 0 || x === COLS-1 || y === ROWS-1 ? 1 : 0));
  // Broken mine supports divide the cavern into small, navigable chambers.
  [[5,1,1],[5,2,1],[5,3,1],[5,7,1],[5,8,1],[5,9,1],[5,10,1],[10,1,1],[10,2,1],[10,3,1],[10,4,1],[10,8,1],[10,9,1],[10,10,1],[14,1,1],[14,2,1],[14,3,1],[14,4,1],[14,5,1],[14,8,1],[14,9,1],[14,10,1],[2,5,1],[3,5,1],[4,5,1],[7,6,1],[8,6,1],[9,6,1],[11,6,1],[12,6,1],[13,6,1],[16,6,1],[17,6,1],[3,8,1],[4,8,1],[7,3,1],[8,3,1],[12,9,1],[13,9,1]].forEach(([x,y,v]) => map[y][x] = v);
  // Door gaps keep every chamber connected.
  [[5,5],[10,6],[14,6],[5,6],[10,5],[14,7]].forEach(([x,y]) => map[y][x] = 0);
  const torches = [{x:2.5,y:1.55},{x:8.7,y:1.5},{x:12,y:4.7},{x:7.5,y:9.9},{x:17.2,y:2.1},{x:17.4,y:9.7}];
  let player, spiders, veins, exit, lastTime = 0, toastTimer;
  const rnd = (n) => {const x=Math.sin(n*127.1+state.floor*311.7)*43758.5453; return x-Math.floor(x)};
  const say = (text) => {ui.toast.textContent=text;ui.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),1350)};
  function freshFloor() {
    player = {x:2.45,y:2.6,r:.25,invuln:0,walk:0,swing:0};
    const scale = Math.min(state.floor-1,4);
    spiders = [[7.7,2.1],[12.4,8.2],[17.3,4.2]].map((p,i)=>({x:p[0],y:p[1],r:.28,hp:1+((state.floor>2&&i===1)?1:0),speed:.62+scale*.045,phase:rnd(i+5)*6,alive:true,hit:0,web:0}));
    veins = [{x:8.6,y:4.5,mine:false},{x:12.2,y:2.4,mine:false},{x:16.5,y:8.1,mine:false}];
    exit = {x:17.4,y:9.35}; state.kills=0;state.veinsMined=0;state.hp=5;state.dead=false;state.won=false;state.lastDamage=-10;state.particles=[];state.loot=[];
    ui.over.hidden=true;ui.victory.hidden=true;ui.hint.classList.remove('gone');
    updateUI();
  }
  function updateUI(){
    ui.coins.textContent=state.coins;ui.ore.textContent=state.ore;ui.hp.textContent=`${state.hp} / 5`;
    ui.hearts.innerHTML=Array.from({length:5},(_,i)=>`<span class="${i>=state.hp?'empty':''}">♥</span>`).join('');ui.hearts.setAttribute('aria-label',`${state.hp} of 5 health`);
    ui.xp.textContent=`${state.xp} / 5`;ui.xpFill.style.width=`${state.xp/5*100}%`;
    ui.spiders.textContent=`${state.kills}`;ui.oreObj.textContent=`${state.veinsMined}`;
    ui.spiderCheck.classList.toggle('done',state.kills>=3);ui.spiderCheck.textContent=state.kills>=3?'✓':'○';
    ui.oreCheck.classList.toggle('done',state.veinsMined>=2);ui.oreCheck.textContent=state.veinsMined>=2?'✓':'○';
    const ready=state.kills>=3&&state.veinsMined>=2;ui.liftCheck.classList.toggle('done',ready);ui.liftCheck.textContent=ready?'✓':'○';
    ui.floor.textContent=String(state.floor).padStart(2,'0');ui.depth.textContent=`DEPTH ${String(state.floor).padStart(2,'0')} · ${300+((state.floor-1)*180)}M`;
  }
  function solid(x,y){const tx=Math.floor(x),ty=Math.floor(y);return tx<0||ty<0||tx>=COLS||ty>=ROWS||map[ty][tx]===1}
  function canMove(x,y,r){return !solid(x-r,y-r)&&!solid(x+r,y-r)&&!solid(x-r,y+r)&&!solid(x+r,y+r)}
  function moveEntity(e,dx,dy){if(canMove(e.x+dx,e.y,e.r))e.x+=dx;if(canMove(e.x,e.y+dy,e.r))e.y+=dy}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function puff(x,y,color,n=8){for(let i=0;i<n;i++){const a=rnd(i+state.t*10+x)*Math.PI*2,s=.4+rnd(i*5+y)*1.4;state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-.3,life:.45+rnd(i+3)*.5,max:.9,color,size:1.5+rnd(i+4)*3})}}
  function attack(){if(state.dead||state.won||state.t-state.lastAttack<.4)return;state.lastAttack=state.t;player.swing=.28;ui.hint.classList.add('gone');
    const targets=spiders.filter(s=>s.alive).map(s=>({e:s,type:'spider'})).concat(veins.filter(v=>!v.mine).map(v=>({e:v,type:'vein'})));
    let hit=false;
    for(const target of targets){const e=target.e,dx=e.x-player.x,dy=e.y-player.y,d=Math.hypot(dx,dy),front=(dx*state.facing.x+dy*state.facing.y)/(d||1);if(d<1.38&&front>-.08){hit=true;if(target.type==='spider'){e.hp--;e.hit=.2;puff(e.x,e.y,'#f1bd6c',7);if(e.hp<=0){e.alive=false;state.kills++;state.xp=Math.min(5,state.xp+1);const c=2+Math.floor(rnd(e.x+state.t)*4);state.loot.push({x:e.x,y:e.y,value:c,born:state.t});puff(e.x,e.y,'#d7b855',12);say(`SPIDER SLAIN  ·  ${c} GILT DROPPED`);updateUI()}else say('THE SPIDER SHRIEKS');}else say('ORE VEIN — PRESS F TO MINE');}}
    if(!hit) puff(player.x+state.facing.x*.7,player.y+state.facing.y*.7,'#e6d9a1',4);
    if(state.sound) blip(hit?170:270,.045,'triangle',.022);
  }
  function mine(){if(state.dead||state.won||state.t-state.lastMine<.45)return;state.lastMine=state.t;const v=veins.find(v=>!v.mine&&dist(v,player)<1.55);if(!v){say('NO ORE WITHIN REACH');return;}v.mine=true;state.veinsMined++;state.ore+=1;const amount=3+Math.floor(rnd(v.x+state.floor)*5);state.coins+=amount;state.xp=Math.min(5,state.xp+1);puff(v.x,v.y,'#b9d578',18);say(`ORE CRACKED  ·  +${amount} GILT`);if(state.sound)blip(520,.1,'sine',.04);updateUI();}
  function damage(){if(state.t-state.lastDamage<1.15||state.dead)return;state.lastDamage=state.t;state.hp--;state.shake=8;player.invuln=1.1;puff(player.x,player.y,'#c95349',10);if(state.sound)blip(90,.18,'sawtooth',.04);updateUI();if(state.hp<=0){state.dead=true;ui.over.hidden=false}}
  function update(dt){state.t+=dt;if(state.dead||state.won)return;player.invuln=Math.max(0,player.invuln-dt);player.swing=Math.max(0,player.swing-dt);state.shake=Math.max(0,state.shake-dt*20);
    let dx=0,dy=0;if(keys.has('w')||keys.has('arrowup'))dy--;if(keys.has('s')||keys.has('arrowdown'))dy++;if(keys.has('a')||keys.has('arrowleft'))dx--;if(keys.has('d')||keys.has('arrowright'))dx++;
    if(dx||dy){const l=Math.hypot(dx,dy);dx/=l;dy/=l;const speed=2.55;moveEntity(player,dx*speed*dt,dy*speed*dt);player.walk+=dt*10;player.moving=true;state.facing={x:Math.abs(dx)>Math.abs(dy)?Math.sign(dx):0,y:Math.abs(dy)>=Math.abs(dx)?Math.sign(dy):0};ui.hint.classList.add('gone')}else player.moving=false;
    for(const s of spiders){if(!s.alive)continue;s.hit=Math.max(0,s.hit-dt);s.phase+=dt*2.7;const d=dist(s,player);if(d<8){const vx=(player.x-s.x)/(d||1),vy=(player.y-s.y)/(d||1);moveEntity(s,vx*s.speed*dt,vy*s.speed*dt);}if(d<.58)damage();if(rnd(Math.floor(state.t*2)+s.x*2)>.98&&d<4)s.web=.4;s.web=Math.max(0,s.web-dt)}
    for(const l of state.loot){l.bob=Math.sin((state.t-l.born)*5)*.07;if(dist(l,player)<.55){state.coins+=l.value;l.got=true;puff(l.x,l.y,'#e5c363',8);say(`+${l.value} GILT COINS`);if(state.sound)blip(720,.08,'sine',.025);updateUI()}}state.loot=state.loot.filter(l=>!l.got);
    state.particles=state.particles.filter(p=>p.life>0);for(const p of state.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=1.2*dt;p.vx*=.98}
    if(dist(player,exit)<.75){if(state.kills>=3&&state.veinsMined>=2){state.won=true;ui.victory.hidden=false;$('#victory-copy').textContent=`${state.coins} gilt reclaimed · ${state.ore} ore chunks · ${state.kills} spiders slain.`;ui.liftCheck.classList.add('done');ui.liftCheck.textContent='✓';if(state.sound)blip(660,.35,'sine',.04)}else if(Math.floor(state.t*2)%3===0){say(`LIFT SEALED · ${Math.max(0,3-state.kills)} SPIDERS · ${Math.max(0,2-state.veinsMined)} VEINS LEFT`)}}
  }
  function blip(freq,duration,type='sine',volume=.03){try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ac=blip.ac||(blip.ac=new AC());if(!state.sound)return;const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+duration)}catch{}}
  function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
  function drawFloor(x,y){const n=(x*71+y*127)%7, colors=['#34392e','#363b30','#31372d','#393c31','#33382e','#373b30','#30362d'];ctx.fillStyle=colors[n];ctx.fillRect(x*T,y*T,T,T);ctx.fillStyle='#484a3b';ctx.globalAlpha=.18;ctx.fillRect(x*T+2,y*T+2,T-4,1);ctx.globalAlpha=1;
    const q=rnd(x*40+y*19);if(q>.75){ctx.fillStyle='#20261f';ctx.fillRect(x*T+8+q*18,y*T+12,2,1);ctx.fillRect(x*T+13+q*13,y*T+18,1,2)}if(q<.11){ctx.strokeStyle='#272e27';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x*T+12,y*T+39);ctx.lineTo(x*T+16,y*T+36);ctx.lineTo(x*T+18,y*T+39);ctx.stroke()}}
  function drawWall(x,y){const px=x*T,py=y*T;ctx.fillStyle='#232821';ctx.fillRect(px,py,T,T);ctx.fillStyle='#4b4d3e';ctx.fillRect(px+1,py+2,T-2,20);ctx.fillStyle='#3b4034';ctx.fillRect(px+2,py+22,T-4,23);ctx.fillStyle='#30362e';ctx.fillRect(px+2,py+43,T-4,3);ctx.fillStyle='#60604a';ctx.globalAlpha=.35;ctx.fillRect(px+5,py+5,14,2);ctx.fillRect(px+25,py+26,17,2);ctx.globalAlpha=1;ctx.strokeStyle='#242921';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px+23,py+3);ctx.lineTo(px+23,py+21);ctx.moveTo(px+2,py+22);ctx.lineTo(px+46,py+22);ctx.stroke();
    const above=map[y-1]?.[x]===0;if(above){ctx.fillStyle='#111510';ctx.fillRect(px,py,T,7);ctx.fillStyle='#5e5e47';ctx.fillRect(px+1,py+4,T-2,3)}}
  function drawTorch(t){const x=t.x*T,y=t.y*T,flick=.92+Math.sin(state.t*9+t.x)*.07;const g=ctx.createRadialGradient(x,y,2,x,y,145);g.addColorStop(0,`rgba(221,135,72,${.22*flick})`);g.addColorStop(.4,`rgba(181,104,53,${.09*flick})`);g.addColorStop(1,'rgba(161,99,51,0)');ctx.fillStyle=g;ctx.fillRect(x-145,y-145,290,290);ctx.fillStyle='#776e51';ctx.fillRect(x-3,y-14,6,17);ctx.fillStyle='#df9d57';ctx.beginPath();ctx.ellipse(x,y-17,4,8+Math.sin(state.t*13+t.y)*1.5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0ad';ctx.beginPath();ctx.ellipse(x,y-18,1.3,4,0,0,Math.PI*2);ctx.fill()}
  function drawOre(v){const x=v.x*T,y=v.y*T;ctx.fillStyle='#20251f';ctx.beginPath();ctx.ellipse(x,y+13,17,8,0,0,Math.PI*2);ctx.fill();for(let i=0;i<5;i++){const px=x+(i-2)*6,py=y+4-Math.abs(i-2)*3;ctx.fillStyle=['#62644f','#77745a','#565c4c'][i%3];ctx.beginPath();ctx.moveTo(px-7,py+8);ctx.lineTo(px-5,py-3);ctx.lineTo(px+1,py-8);ctx.lineTo(px+7,py-2);ctx.lineTo(px+8,py+8);ctx.closePath();ctx.fill();ctx.fillStyle=i%2?'#b8c76c':'#d0d77a';ctx.fillRect(px-1,py-3,3,2);ctx.fillStyle='#e4e6a1';ctx.fillRect(px+1,py-1,1,1)}}
  function drawSpider(s){if(!s.alive)return;const x=s.x*T,y=s.y*T,bob=Math.sin(s.phase)*2;ctx.save();ctx.translate(x,y+bob);if(s.hit>0)ctx.globalAlpha=.55;ctx.strokeStyle='#20231d';ctx.lineWidth=3;ctx.lineCap='round';for(let i=0;i<4;i++){const side=i<2?-1:1,idx=i%2;const ax=(idx?8:-8),ay=(idx?3:-3);ctx.beginPath();ctx.moveTo(ax*side,ay);ctx.lineTo((ax+side*7),ay-7);ctx.lineTo((ax+side*12),ay+((i%2)?-10:7));ctx.stroke();ctx.beginPath();ctx.moveTo(ax*side,ay+2);ctx.lineTo((ax+side*8),ay+9);ctx.lineTo((ax+side*13),ay+13);ctx.stroke()}
    ctx.fillStyle='#41463a';ctx.beginPath();ctx.ellipse(-5,1,11,9,-.15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#59604b';ctx.beginPath();ctx.ellipse(6,0,8,7,.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d66250';ctx.shadowColor='#dd6550';ctx.shadowBlur=7;ctx.fillRect(7,-3,2,2);ctx.fillRect(7,2,2,2);ctx.shadowBlur=0;ctx.restore();
    if(s.hp>1){ctx.fillStyle='#151912';ctx.fillRect(x-10,y-18,20,3);ctx.fillStyle='#c67452';ctx.fillRect(x-10,y-18,20*(s.hp/2),3)}}
  function drawPlayer(){const x=player.x*T,y=player.y*T;ctx.save();ctx.translate(x,y+Math.sin(player.walk)*1.1*(player.moving?1:0));if(player.invuln>0&&Math.floor(state.t*12)%2)ctx.globalAlpha=.45;ctx.fillStyle='#161a15';ctx.beginPath();ctx.ellipse(0,12,12,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#80684e';roundRect(-8,-9,16,20,5);ctx.fill();ctx.fillStyle='#a98a61';roundRect(-7,-12,14,14,5);ctx.fill();ctx.fillStyle='#737553';roundRect(-10,-16,20,10,5);ctx.fill();ctx.fillStyle='#c6b47a';ctx.fillRect(-9,-12,18,3);ctx.fillStyle='#282d24';ctx.fillRect(-4,-7,8,3);ctx.fillStyle='#e6d68d';ctx.fillRect(-3,-6,2,1);ctx.fillRect(2,-6,2,1);
    const angle=Math.atan2(state.facing.y,state.facing.x);if(player.swing>0){ctx.save();ctx.rotate(angle);ctx.strokeStyle='#fff3c4';ctx.lineWidth=4;ctx.globalAlpha=.78;ctx.beginPath();ctx.arc(4,0,22,-.85,.85);ctx.stroke();ctx.globalAlpha=1;ctx.strokeStyle='#e0e5df';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(24,0);ctx.stroke();ctx.strokeStyle='#b8a571';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(4,-4);ctx.lineTo(4,4);ctx.stroke();ctx.restore()}else{ctx.save();ctx.rotate(angle);ctx.strokeStyle='#dddeda';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(17,0);ctx.stroke();ctx.strokeStyle='#b4a271';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(2,-4);ctx.lineTo(2,4);ctx.stroke();ctx.restore()}ctx.restore()}
  function drawExit(){const x=exit.x*T,y=exit.y*T,ready=state.kills>=3&&state.veinsMined>=2;ctx.fillStyle='#1b201a';ctx.beginPath();ctx.ellipse(x,y+9,26,15,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=ready?'#849352':'#4c4a3b';ctx.fillRect(x-22,y-3,44,15);ctx.fillStyle='#757157';ctx.fillRect(x-26,y-10,52,10);ctx.fillStyle='#a29b70';ctx.fillRect(x-22,y-6,44,3);ctx.fillStyle=ready?'#d4df76':'#8c8663';ctx.fillRect(x-3,y-2,6,13);ctx.fillStyle='#242a20';ctx.fillRect(x-1,y,2,7);ctx.fillStyle='#ded9ad';ctx.fillRect(x+11,y-1,3,3);if(ready){ctx.fillStyle=`rgba(202,225,112,${.3+Math.sin(state.t*5)*.15})`;ctx.beginPath();ctx.arc(x,y-3,32,0,Math.PI*2);ctx.fill()}}
  function render(){ctx.save();if(state.shake>0)ctx.translate((rnd(state.t*80)-.5)*state.shake,(rnd(state.t*91)-.5)*state.shake);ctx.fillStyle='#11150f';ctx.fillRect(0,0,W,H);
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(!map[y][x])drawFloor(x,y);
    // Wall shadows and masonry.
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(map[y][x])drawWall(x,y);
    torches.forEach(drawTorch);drawExit();veins.filter(v=>!v.mine).forEach(drawOre);
    for(const l of state.loot){const x=l.x*T,y=l.y*T+l.bob*10;ctx.fillStyle='#1c2018';ctx.beginPath();ctx.ellipse(x,y+7,9,4,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#dfbd5c';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0a1';ctx.fillRect(x-1,y-4,2,7);ctx.fillRect(x-3,y-1,6,2)}
    spiders.forEach(drawSpider);drawPlayer();
    for(const p of state.particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x*T,p.y*T,p.size,p.size)}ctx.globalAlpha=1;
    // A soft mine-darkness vignette, leaving the nearby lanterns legible.
    const px=player.x*T,py=player.y*T;const vg=ctx.createRadialGradient(px,py,90,px,py,560);vg.addColorStop(0,'rgba(7,10,8,0)');vg.addColorStop(.65,'rgba(7,10,8,.12)');vg.addColorStop(1,'rgba(5,7,6,.72)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
    // Dust motes catch the torchlight.
    for(let i=0;i<30;i++){const x=rnd(i*7+Math.floor(state.t*.4))*W,y=rnd(i*13+Math.floor(state.t*.27))*H;ctx.fillStyle=`rgba(213,190,126,${.08+rnd(i+3)*.16})`;ctx.fillRect(x,y,1,1)}
    ctx.restore();}
  function loop(now){const dt=Math.min(.04,(now-lastTime)/1000||0);lastTime=now;update(dt);render();requestAnimationFrame(loop)}
  function actionFromKey(e,down){const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(down&&!keys.has(k)){if(k===' '||k==='j')attack();if(k==='f'||k==='e')mine();if(k==='enter'&&(state.dead||state.won))advance()}if(down)keys.add(k);else keys.delete(k)}
  window.addEventListener('keydown',e=>actionFromKey(e,true));window.addEventListener('keyup',e=>actionFromKey(e,false));window.addEventListener('blur',()=>keys.clear());
  canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H,ang=Math.atan2(y-player.y*T,x-player.x*T);state.facing={x:Math.abs(Math.cos(ang))>Math.abs(Math.sin(ang))?Math.sign(Math.cos(ang)):0,y:Math.abs(Math.sin(ang))>=Math.abs(Math.cos(ang))?Math.sign(Math.sin(ang)):0};attack()});
  document.querySelectorAll('.dpad button').forEach(btn=>{const dir=btn.dataset.dir;const mapKey={up:'arrowup',down:'arrowdown',left:'arrowleft',right:'arrowright'};btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);keys.add(mapKey[dir])});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>btn.addEventListener(ev,()=>keys.delete(mapKey[dir])))});
  $('#touch-attack').addEventListener('pointerdown',e=>{e.preventDefault();attack()});$('#touch-mine').addEventListener('pointerdown',e=>{e.preventDefault();mine()});$('#retry-button').addEventListener('click',()=>{state.coins=0;state.ore=0;state.floor=1;state.xp=0;freshFloor()});$('#next-floor-button').addEventListener('click',advance);
  $('#sound-toggle').addEventListener('click',()=>{state.sound=!state.sound;$('#sound-toggle').innerHTML=`♫ <span>SOUND ${state.sound?'ON':'OFF'}</span>`;if(state.sound)blip(420,.08)});
  function advance(){if(state.dead){freshFloor();return}if(!state.won)return;state.floor++;freshFloor();say(`FLOOR ${String(state.floor).padStart(2,'0')} · THE MINE GOES DEEPER`)}
  freshFloor();requestAnimationFrame(loop);
})();
