import { createFluidSimulation } from './fluid-simulation.js';

const BOUNDS=176,SIZE=BOUNDS*4;
const TAU=Math.PI*2;

export function createCoreField({radius=112}={}) {
  const fluid=createFluidSimulation({resolution:160,bounds:BOUNDS,radius});
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=SIZE;
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,preserveDrawingBuffer:true});
  const resources={shaders:[],program:null,buffer:null};
  function releaseGL() {
    if(!gl)return;
    if(resources.buffer)gl.deleteBuffer(resources.buffer);
    resources.shaders.forEach(shader=>gl.deleteShader(shader));
    if(resources.program)gl.deleteProgram(resources.program);
  }
  if(gl) {
    const vertex=`attribute vec2 a_position;varying vec2 v_uv;
      void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
    const fragment=`precision mediump float;
      varying vec2 v_uv;
      uniform vec2 u_pointer,u_direction;
      uniform float u_radius,u_bounds,u_opening,u_stretch,u_time,u_energy,u_listening,u_thinking,u_complete;
      vec3 transported(vec2 world) {
        if(u_opening<.001)return vec3(world,1000.);
        vec2 d=world-u_pointer;
        float a=dot(d,u_direction)/u_stretch;
        float b=dot(d,vec2(-u_direction.y,u_direction.x))*u_stretch;
        float r=length(vec2(a,b)/48.)*48.;
        float angle=atan(b,a);
        float h=u_opening*(1.+.014*sin(angle*2.+u_time*.9)+.006*sin(angle*3.-u_time*.7));
        float rr=r/48.,hh=h/48.;
        float z=max(0.,rr*rr-hh*hh);
        for(int k=0;k<4;k++){
          float e=exp(-z);
          z=max(0.,z-(z+hh*hh*e-rr*rr)/(1.-hh*hh*e));
        }
        float factor=sqrt(z)*48./max(r,.0001);
        vec2 source=u_pointer+a*factor*u_stretch*u_direction+
          b*factor/u_stretch*vec2(-u_direction.y,u_direction.x);
        return vec3(source,r-h);
      }
      void main(){
        vec2 world=(vec2(v_uv.x,1.-v_uv.y)-.5)*u_bounds*2.;
        vec3 material=transported(world);
        float outerSdf=length(material.xy)-u_radius;
        float sdf=max(outerSdf,-material.z);
        float black=1.-smoothstep(-.46,.46,sdf);
        float r=length(world),angle=atan(world.y,world.x);
        float listenWave=.5+.5*sin(u_time*3.2);
        float stateBreath=1.+u_listening*(.06+.17*listenWave)+u_thinking*.045;
        float folds=sin(angle*7.+u_time*.43)*1.6+
          sin(angle*13.-u_time*.29)*.92+sin(angle*23.+u_time*.19)*.38;
        float crest=outerSdf-2.2-folds;
        float arcs=pow(.5+.5*cos(angle-.35-u_time*.035),23.)+
          pow(.5+.5*cos(angle-2.08+u_time*.029),19.)+
          pow(.5+.5*cos(angle-3.88-u_time*.033),28.)+
          pow(.5+.5*cos(angle-5.23+u_time*.028),25.);
        arcs=clamp(arcs,0.,1.);
        float moving=pow(.5+.5*cos(angle-u_time*(.28+u_thinking*.46)),190.);
        float secondary=pow(.5+.5*cos(angle+u_time*.17-2.4),280.)*.38;
        float highlight=clamp(moving+secondary,0.,1.);
        float patch=clamp(.15+.74*arcs+.16*sin(angle*4.+u_time*.18)+.11*sin(angle*9.-u_time*.24),.035,1.);
        float shoulder=(exp(-pow((outerSdf-8.4-folds*.9)/(4.1+arcs*1.8),2.))*.50+
          exp(-pow((outerSdf-15.)/11.,2.))*.075)*patch;
        float breath=stateBreath*(1.+.09*clamp(u_energy,0.,1.)*(.7+.3*sin(u_time*1.4)));
        float glow=exp(-pow((outerSdf-2.5-folds*.55)/(3.6*breath*(.73+.53*arcs)),2.))*(.28+.68*arcs);
        float caustic=exp(-crest*crest/((1.3+arcs*4.5)*breath))*(.25+.74*arcs);
        float narrow=exp(-pow((outerSdf-1.6-folds*.82)/.82,2.))*highlight*.95;
        float stray=exp(-pow((outerSdf-7.0-folds*2.0)/.78,2.))*(.04+.63*arcs)*arcs;
        float exterior=smoothstep(u_radius-1.,u_radius+.6,r);
        float white=clamp(glow+caustic*(1.-glow)+narrow*(1.-glow)+stray*(1.-glow),0.,1.)*exterior;
        float shade=shoulder*exterior;
        if(u_complete>=0.) {
          float progress=clamp(u_complete,0.,1.);
          float envelope=sin(progress*3.14159265)*pow(1.-progress,.7)*.42;
          float ripple=exp(-pow((r-u_radius-5.-progress*48.)/1.1,2.))*envelope;
          shade=clamp(shade+ripple*.32,0.,1.);
          white=clamp(white+exp(-pow((r-u_radius-3.-progress*48.)/1.3,2.))*envelope,0.,1.);
        }
        float coronaAlpha=white+shade*(1.-white);
        float coronaRgb=white+shade*.27*(1.-white);
        float alpha=black+coronaAlpha*(1.-black);
        float rgb=coronaRgb*(1.-black)/max(alpha,.0001);
        gl_FragColor=vec4(vec3(rgb),alpha);
      }`;
    try {
      const compile=(type,source)=>{
        const shader=gl.createShader(type);if(!shader)throw new Error('Shader unavailable');
        resources.shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Shader unavailable');
        return shader;
      };
      resources.program=gl.createProgram();if(!resources.program)throw new Error('Shader unavailable');
      gl.attachShader(resources.program,compile(gl.VERTEX_SHADER,vertex));
      gl.attachShader(resources.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(resources.program);
      if(!gl.getProgramParameter(resources.program,gl.LINK_STATUS))throw new Error('Shader unavailable');
      gl.useProgram(resources.program);
      resources.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,resources.buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(resources.program,'a_position');
      gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      const uniform=name=>gl.getUniformLocation(resources.program,name);
      const uniforms=Object.fromEntries(['pointer','direction','radius','bounds','opening','stretch','time','energy','listening','thinking','complete'].map(name=>[name,uniform(`u_${name}`)]));
      gl.uniform1f(uniforms.radius,radius);gl.uniform1f(uniforms.bounds,BOUNDS);gl.viewport(0,0,SIZE,SIZE);
      let disposed=false;
      return {
        bounds:BOUNDS,
        displacePoint:(x,y)=>fluid.displacePoint(x,y),
        render(pointer,strength,energy=0,delta=1/60,time,visual={}){
          if(disposed)return canvas;
          fluid.step(pointer,strength,delta,time);const state=fluid.getState();
          gl.uniform2f(uniforms.pointer,state.x,state.y);gl.uniform2f(uniforms.direction,state.dx,state.dy);
          gl.uniform1f(uniforms.opening,state.opening);gl.uniform1f(uniforms.stretch,state.stretch);
          gl.uniform1f(uniforms.time,state.time);gl.uniform1f(uniforms.energy,energy);
          gl.uniform1f(uniforms.listening,visual.listening||0);gl.uniform1f(uniforms.thinking,visual.thinking||0);
          gl.uniform1f(uniforms.complete,Number.isFinite(visual.completeProgress)?visual.completeProgress:-1);
          gl.drawArrays(gl.TRIANGLES,0,6);return canvas;
        },
        destroy(){if(disposed)return;disposed=true;fluid.destroy();releaseGL();},
      };
    } catch {releaseGL();}
  }

  // Canvas fallback renders the same transported density, with an exterior-only
  // corona underneath it. Shader compilation failure therefore keeps the effect.
  const fallback=document.createElement('canvas');fallback.width=fallback.height=SIZE;
  const ctx=fallback.getContext('2d');
  const grid=document.createElement('canvas');grid.width=grid.height=fluid.resolution;
  const gridCtx=grid.getContext('2d');const image=gridCtx.createImageData(fluid.resolution,fluid.resolution);
  let disposed=false;
  function contour(offset,time,start=0,end=TAU){
    ctx.beginPath();
    for(let i=0;i<=192;i++){
      const a=start+i/192*(end-start);
      const irregular=Math.sin(a*7+time*.43)*1.6+Math.sin(a*13-time*.29)*.92+Math.sin(a*23+time*.19)*.38;
      const r=radius+offset+irregular;
      const p=fluid.displacePoint(Math.cos(a)*r,Math.sin(a)*r);
      if(!i)ctx.moveTo(...p);else ctx.lineTo(...p);
    }
    if(end-start>=TAU-.001)ctx.closePath();
  }
  return {
    bounds:BOUNDS,
    displacePoint:(x,y)=>fluid.displacePoint(x,y),
    render(pointer,strength,energy=0,delta=1/60,time,visual={}){
      if(disposed)return fallback;
      fluid.step(pointer,strength,delta,time);const state=fluid.getState();
      const values=fluid.density;
      for(let i=0;i<values.length;i++)image.data[i*4+3]=Math.round(values[i]*255);
      gridCtx.putImageData(image,0,0);
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,SIZE,SIZE);
      ctx.setTransform(2,0,0,2,BOUNDS*2,BOUNDS*2);
      ctx.save();ctx.beginPath();ctx.rect(-BOUNDS,-BOUNDS,BOUNDS*2,BOUNDS*2);
      ctx.arc(0,0,radius-.8,0,TAU,true);ctx.clip('evenodd');
      const listening=Math.max(0,Math.min(1,visual.listening||0));
      const thinking=Math.max(0,Math.min(1,visual.thinking||0));
      const breath=1+listening*(.06+.17*(.5+.5*Math.sin(state.time*3.2)))+thinking*.045;
      // A faint broken base supports separate pearly arcs, never a thick outline.
      contour(2.4,state.time);ctx.strokeStyle='rgba(255,255,255,.23)';ctx.lineWidth=1.25;
      ctx.shadowColor='rgba(255,255,255,.28)';ctx.shadowBlur=6*breath;ctx.stroke();
      for(const [center,width]of[[.35,.35],[2.08,.41],[3.88,.32],[5.23,.34]]){
        const shift=center+Math.sin(state.time*.04+center)*.11;
        contour(8.4,state.time,shift-width*1.3,shift+width*1.3);
        ctx.strokeStyle='rgba(64,70,73,.23)';ctx.lineWidth=6.0;
        ctx.shadowColor='rgba(77,83,85,.12)';ctx.shadowBlur=8;ctx.stroke();
        contour(2.1,state.time,shift-width,shift+width);
        ctx.strokeStyle='rgba(255,255,255,.96)';ctx.lineWidth=3.7*breath;
        ctx.shadowColor='rgba(255,255,255,.93)';ctx.shadowBlur=10*breath;ctx.stroke();
        contour(6.7,state.time,shift-width*.73,shift+width*.73);
        ctx.strokeStyle='rgba(255,255,255,.60)';ctx.lineWidth=.8;ctx.shadowBlur=3;ctx.stroke();
      }
      const moving=state.time*(.28+thinking*.46);
      for(const [center,width,alpha]of[[moving,.095,.95],[2.4-state.time*.17,.070,.42]]) {
        contour(1.7,state.time,center-width,center+width);
        ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=1.3;
        ctx.shadowColor='rgba(255,255,255,.68)';ctx.shadowBlur=4;ctx.stroke();
      }
      if(Number.isFinite(visual.completeProgress)&&visual.completeProgress>=0) {
        const progress=Math.max(0,Math.min(1,visual.completeProgress));
        const alpha=Math.sin(progress*Math.PI)*(1-progress)**.7*.42;
        ctx.shadowBlur=0;ctx.beginPath();ctx.arc(0,0,radius+5+progress*48,0,TAU);
        ctx.strokeStyle=`rgba(60,67,70,${alpha*.32})`;ctx.lineWidth=1.1;ctx.stroke();
        ctx.beginPath();ctx.arc(0,0,radius+3+progress*48,0,TAU);
        ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=1.25;ctx.stroke();
      }
      ctx.restore();
      ctx.imageSmoothingEnabled=true;ctx.drawImage(grid,-BOUNDS,-BOUNDS,BOUNDS*2,BOUNDS*2);
      return fallback;
    },
    destroy(){disposed=true;fluid.destroy();},
  };
}
