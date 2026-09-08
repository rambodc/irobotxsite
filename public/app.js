const firebaseConfig={apiKey:"AIzaSyAO1jsdnwbpOqhcNSLfRGoCLNBJIvFYBi0",authDomain:"irobotxsite.firebaseapp.com",projectId:"irobotxsite",storageBucket:"irobotxsite.firebasestorage.app",messagingSenderId:"881476176668",appId:"1:881476176668:web:9032fff3a3e8769cf4c8d9",measurementId:"G-RPYXRB0LEN"};

async function startAnalytics(){try{const [{initializeApp},{getAnalytics,isSupported}]=await Promise.all([import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),import("https://www.gstatic.com/firebasejs/11.10.0/firebase-analytics.js")]);const app=initializeApp(firebaseConfig);if(await isSupported())getAnalytics(app)}catch(error){}}
addEventListener("load",()=>setTimeout(startAnalytics,7000),{once:true});

document.querySelectorAll("[data-year]").forEach(el=>{el.textContent=new Date().getFullYear()});
const menuButton=document.querySelector(".menu-button");
const mobileNav=document.querySelector(".mobile-nav");
if(menuButton&&mobileNav){menuButton.addEventListener("click",()=>{const open=mobileNav.classList.toggle("open");menuButton.setAttribute("aria-expanded",String(open))});mobileNav.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{mobileNav.classList.remove("open");menuButton.setAttribute("aria-expanded","false")}));}

const reduceMotion=matchMedia("(prefers-reduced-motion: reduce)").matches;
if(!reduceMotion&&"IntersectionObserver" in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target)}}),{threshold:.12});document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));}else{document.querySelectorAll(".reveal").forEach(el=>el.classList.add("is-visible"));}

async function startNetwork(){
  const canvas=document.querySelector(".hero-canvas");
  if(!canvas||reduceMotion||innerWidth<700||!window.WebGLRenderingContext)return;
  try{
    const THREE=await import("https://cdn.jsdelivr.net/npm/three@0.167.1/build/three.module.js");
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(50,canvas.clientWidth/canvas.clientHeight,.1,100);
    camera.position.z=15;
    const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,powerPreference:"low-power"});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
    const count=68,positions=new Float32Array(count*3),nodes=[];
    for(let i=0;i<count;i++){const radius=3+Math.random()*6,angle=Math.random()*Math.PI*2;const node={x:Math.cos(angle)*radius,y:(Math.random()-.5)*9,z:Math.sin(angle)*radius-1};nodes.push(node);positions.set([node.x,node.y,node.z],i*3)}
    const points=new THREE.Points(new THREE.BufferGeometry().setAttribute("position",new THREE.BufferAttribute(positions,3)),new THREE.PointsMaterial({color:0x4da3ff,size:.075,transparent:true,opacity:.9}));scene.add(points);
    const linePositions=[];for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){const a=nodes[i],b=nodes[j],d=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);if(d<2.05)linePositions.push(a.x,a.y,a.z,b.x,b.y,b.z)}
    const lines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute(linePositions,3)),new THREE.LineBasicMaterial({color:0x51d8ff,transparent:true,opacity:.15}));scene.add(lines);
    const group=new THREE.Group();group.add(points,lines);scene.add(group);document.body.classList.add("webgl-ready");
    let pointerX=0,pointerY=0;addEventListener("pointermove",event=>{pointerX=(event.clientX/innerWidth-.5)*.5;pointerY=(event.clientY/innerHeight-.5)*.25},{passive:true});
    let active=true;document.addEventListener("visibilitychange",()=>{active=!document.hidden});
    const animate=()=>{if(!active){requestAnimationFrame(animate);return}group.rotation.y+=.0015;group.rotation.x+=(pointerY-group.rotation.x)*.02;camera.position.x+=(pointerX-camera.position.x)*.015;renderer.render(scene,camera);requestAnimationFrame(animate)};animate();
    addEventListener("resize",()=>{camera.aspect=canvas.clientWidth/canvas.clientHeight;camera.updateProjectionMatrix();renderer.setSize(canvas.clientWidth,canvas.clientHeight,false)},{passive:true});
  }catch(error){canvas.hidden=true;}
}
startNetwork();
