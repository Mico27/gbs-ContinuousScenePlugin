'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'assets', 'sprites');
const SLOT = ['idleR','idleL','idleU','idleD','moveR','moveL','moveU','moveD'];

const args = process.argv.slice(2);
const files = args.length ? args.map(a=>a.endsWith('.gbsres')?a:a+'.png.gbsres')
                          : fs.readdirSync(DIR).filter(f=>f.endsWith('.png.gbsres'));

for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(DIR,f),'utf8')); } catch(e){ console.log(f,'PARSE ERR'); continue; }
  console.log(`\n### ${d.name}  (${d.width}x${d.height})  numTiles=${d.numTiles}  canvas=${d.canvasWidth}x${d.canvasHeight}@(${d.canvasOriginX},${d.canvasOriginY})  bounds=(${d.boundsX},${d.boundsY},${d.boundsWidth},${d.boundsHeight})`);
  for (const st of d.states) {
    const filled = st.animations.map((a,i)=>{
      const nf = a.frames.length;
      const tilesPer = a.frames.map(fr=>fr.tiles.length);
      const tot = tilesPer.reduce((x,y)=>x+y,0);
      return tot>0 ? `${SLOT[i]}[${a.frames.map((fr,fi)=>fr.tiles.length).join(',')}f]` : null;
    }).filter(Boolean);
    console.log(`  state "${st.name}" type=${st.animationType} flipLeft=${st.flipLeft}: ${filled.join('  ')}`);
    // show slice mapping for first frame of each filled slot
    st.animations.forEach((a,i)=>{
      a.frames.forEach((fr,fi)=>{
        if(fr.tiles.length){
          const slices = fr.tiles.map(t=>`(sx${t.sliceX},sy${t.sliceY}->x${t.x},y${t.y}${t.flipX?',fX':''}${t.priority?',pri':''})`).join(' ');
          console.log(`      ${SLOT[i]} f${fi}: ${slices}`);
        }
      });
    });
  }
}
