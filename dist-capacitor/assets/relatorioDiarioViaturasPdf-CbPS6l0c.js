import{r as e}from"./chunk-7ZXdHUL4.js";import{S as t,a as n,n as r,p as i,t as a}from"./relatorioDiarioViaturasPdfLayout-Cj608Uo2.js";import{t as o}from"./html2canvas-CEoTSJ6L.js";var s=e(o(),1),c=5.85*1.3,l=4*1.3,u=6*1.3,d=`
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 12mm; background: #fff; }
  .rdv-export-root { max-width: 210mm; margin: 0 auto; }
  table { border-collapse: collapse; width: 100%; font-size: 9pt; }
  th, td { border: 1px solid #0f172a; padding: 4px 6px; vertical-align: top; }
  thead th { background: rgba(226,240,217,0.95); color: #334155; font-weight: bold; }
  tbody tr:nth-child(odd) td { background: #fff; }
  tbody tr:nth-child(even) td { background: #f1f5f9; }
  .rdv-section-bar { background: #e2f0d9; border: 1px solid #0f172a; border-bottom: none; padding: 6px 8px; font-weight: bold; margin-top: 12px; }
  .rdv-summary-merged { background: #f1f5f9 !important; }
  h1 { font-size: 11pt; margin: 0; text-align: center; }
  h2 { font-size: 10pt; font-weight: normal; margin: 0; text-align: center; }
  h3 { font-size: 10pt; margin: 8px auto 0; text-align: center; border: 1px solid #0f172a; background: #e2f0d9; padding: 6px; max-width: 100%; }
  /* Faixa verde do título: espaço entre título, data e (dia da semana) — iframe de PDF não carrega Tailwind. */
  .rdv-pdf-header-shell > h3.rdv-pdf-header-title-row,
  .rdv-pdf-header-shell > h3 {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    justify-content: center !important;
    column-gap: 0.65rem !important;
    row-gap: 0.35rem !important;
    padding: 7px 12px !important;
  }
  td[data-rdv-sit="Operando"] span { color: #15803d; font-weight: bold; }
  td[data-rdv-sit="Inoperante"] span { color: #dc2626; font-weight: bold; }
  td[data-rdv-sit="Destacada"] span { color: #2563eb; font-weight: bold; }
  /* Conteúdo agrupado para subir só o interior da célula (sem transform na célula). */
  .rdv-pdf-body table th > .rdv-pdf-cell-inner,
  .rdv-pdf-body table td > .rdv-pdf-cell-inner {
    position: relative;
    top: -0.1em;
    display: inline-block;
    max-width: 100%;
    text-align: inherit;
    box-sizing: border-box;
    vertical-align: baseline;
  }
  .rdv-pdf-body table {
    font-size: ${c}pt;
  }
  .rdv-pdf-body table th,
  .rdv-pdf-body table td {
    font-size: ${c}pt;
    padding: ${l}px ${u}px;
    vertical-align: middle;
    text-align: center;
    line-height: 1.1;
  }
  /* Coluna OFICINA: ✓ (sem quadrado) centrado na célula. */
  .rdv-pdf-body table th.rdv-col-oficina,
  .rdv-pdf-body table td.rdv-col-oficina {
    text-align: center;
    vertical-align: middle;
  }
  .rdv-pdf-body table td.rdv-col-oficina > .rdv-pdf-cell-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 1.15em;
    top: 0;
    box-sizing: border-box;
  }
  .rdv-pdf-body .rdv-section-bar {
    font-size: ${c}pt;
  }
  /* Assinatura no PDF: centrada; espaço acima ≈ mt-10 (2,5rem) +30%. */
  .rdv-pdf-body .rdv-pdf-signature-block {
    display: block;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    margin-left: auto;
    margin-right: auto;
    margin-top: calc(2.5rem * 1.3);
    margin-bottom: 4mm;
    padding-bottom: 5mm;
    line-height: 1.45;
    text-align: center;
  }
  .rdv-pdf-body .rdv-pdf-signature-block p {
    text-align: center;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.45;
  }
`;function f(e){for(let t of[`rdv-tabela-ambulancias`,`rdv-tabela-administrativas`]){let n=e.querySelector(`#${t}`);n&&(n.querySelectorAll(`thead tr th:last-child, tbody tr td:last-child`).forEach(e=>{e.remove()}),n.querySelector(`colgroup > col:last-child`)?.remove())}}function p(e){e.querySelectorAll(`.rdv-no-pdf`).forEach(e=>{e.remove()})}function m(e,t){let n=e.querySelectorAll(`select`),r=t.querySelectorAll(`select`),i=Math.min(n.length,r.length);for(let e=0;e<i;e++){let t=n[e],i=r[e];i.value=t.value}}function h(e){let t=e.selectedOptions?.[0];if(t){let e=(t.textContent??``).trim();if(e)return e}let n=e.value?.trim()??``;if(n){let t=Array.from(e.options).find(e=>e.value===n);return t?(t.textContent??``).trim():n}let r=e.selectedIndex;return r>=0&&e.options[r]?(e.options[r].textContent??``).trim():``}function g(e){let n=e.ownerDocument??document;e.querySelectorAll(`input`).forEach(e=>{let r=e;if(r.type===`hidden`)return;if(r.type===`checkbox`){let e=n.createElement(`span`);e.textContent=r.checked?`✓`:``,e.setAttribute(`aria-label`,r.checked?`Na oficina: sim`:`Na oficina: não`),r.replaceWith(e);return}if(r.type===`date`){let e=r.closest(`.rdv-pdf-header-shell h3 label.relative`);if(e){let i=e.querySelector(`span.block`),a=r.value.trim();if(i&&a)i.textContent=t(a)||i.textContent||`—`;else if(a){let e=n.createElement(`span`);e.className=`block text-center font-bold underline decoration-dotted`,e.textContent=t(a)||`—`,r.replaceWith(e);return}r.remove();return}}let i=n.createElement(`span`);if(r.type===`date`&&r.value){let[e,t,n]=r.value.split(`-`);i.textContent=n&&t&&e?`${n}/${t}/${e}`:r.value}else i.textContent=r.value;r.replaceWith(i)}),e.querySelectorAll(`select`).forEach(e=>{let t=e,r=n.createElement(`span`);r.textContent=h(t),t.replaceWith(r)}),e.querySelectorAll(`textarea`).forEach(e=>{let t=e,r=n.createElement(`span`);r.textContent=t.value,t.replaceWith(r)})}function _(e){let t=e.querySelectorAll(`.rdv-pdf-body table th, .rdv-pdf-body table td`),n=e.ownerDocument??document;for(let e of t){if(e.querySelector(`:scope > .rdv-pdf-cell-inner`))continue;let t=n.createElement(`span`);for(t.className=`rdv-pdf-cell-inner`;e.firstChild;)t.appendChild(e.firstChild);e.appendChild(t)}}function v(e,n){if(!/^\d{4}-\d{2}-\d{2}$/.test(n.trim()))return;let r=n.trim(),a=e.querySelector(`input[type='date']`);a instanceof HTMLInputElement&&(a.value=r);let o=e.querySelector(`.rdv-pdf-header-shell h3 label.relative`)?.querySelector(`span.block`);o&&(o.textContent=t(r)||`—`);let s=e.querySelector(`.rdv-pdf-header-weekday`);if(s){let e=i(r);s.textContent=e?`(${e})`:``}}function y(e,t){let n=e.cloneNode(!0);return m(e,n),p(n),f(n),t?.headerDateIso&&v(n,t.headerDateIso),g(n),_(n),`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório Diário de Viaturas</title>
<style>${d}</style>
</head>
<body>
<div id="rdv-export-root" class="rdv-export-root">
${n.innerHTML}
</div>
</body>
</html>`}var b=`JPEG`,x=`image/jpeg`,S=.72;function C(e){return 210-e*2}function w(e){return 297-e*2}function T(e){return C(e.marginMm)*(e.imageWidthPercent/100)}function E(e,t){let n=e.createElement(`style`);n.setAttribute(`data-rdv-pdf-fix`,`1`);let r=t.tableContentScale,i=l*r,a=u*r,o=c*r,s=t.signatureFontPt,d=1.3*t.signatureMarginScale;n.textContent=`
    /* Folha RDV_EXPORT_STYLES usa margin:12mm no body — isso rouba espaço e corta o topo face às margens do PDF. */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #ffffff !important;
    }
    .rdv-export-root, .rdv-export-root * {
      box-shadow: none !important;
      outline-color: #0f172a !important;
    }
    .rdv-export-root {
      background-color: #ffffff !important;
      color: #0f172a !important;
      -webkit-font-smoothing: subpixel-antialiased !important;
      text-rendering: geometricPrecision !important;
      box-sizing: border-box !important;
      padding-top: 4mm !important;
      padding-bottom: 12mm !important;
    }
    .rdv-export-root table {
      border-color: #0f172a !important;
    }
    .rdv-export-root thead {
      background-color: transparent !important;
      border-color: #0f172a !important;
    }
    .rdv-export-root thead th {
      background-color: rgba(226, 240, 217, 0.9) !important;
      border-color: #0f172a !important;
      color: #334155 !important;
    }
    .rdv-export-root tbody tr:nth-child(odd) td {
      background-color: #ffffff !important;
    }
    .rdv-export-root tbody tr:nth-child(even) td {
      background-color: #f1f5f9 !important;
    }
    .rdv-export-root .rdv-section-bar {
      background-color: #e2f0d9 !important;
      border-color: #0f172a !important;
      color: #0f172a !important;
    }
    .rdv-export-root .rdv-summary-merged {
      background-color: #f1f5f9 !important;
    }
    /* flow-root evita colapso de margem do título com o pai (no iframe não há Tailwind). */
    .rdv-export-root .rdv-pdf-header-shell {
      display: flow-root !important;
      overflow: visible !important;
      line-height: 1.35 !important;
      padding-top: 1mm !important;
    }
    .rdv-export-root .rdv-pdf-main-title h1 {
      line-height: 1.35 !important;
      padding-top: 0.15em !important;
      box-sizing: border-box !important;
    }
    .rdv-export-root .rdv-pdf-main-title h2 {
      display: block !important;
      margin: 0 !important;
      line-height: 1.4 !important;
      font-size: 10pt !important;
      font-weight: normal !important;
      color: #0f172a !important;
      text-align: center !important;
    }
    /* translateY: a posição da faixa e da tabela mantém-se; o título aproxima-se ou afasta-se delas. */
    .rdv-export-root .rdv-pdf-main-title {
      display: block !important;
      position: relative !important;
      z-index: 5 !important;
      margin-top: 0 !important;
      margin-bottom: 3mm !important;
      padding-bottom: 0.5mm !important;
      transform: translateY(${Number.isFinite(t.mainTitleOffsetMm)?t.mainTitleOffsetMm:0}mm) !important;
      box-sizing: border-box !important;
    }
    /* A faixa verde (h3) vem depois no DOM: sem z-index/margem, pode cobrir a última linha do bloco institucional. */
    .rdv-export-root .rdv-pdf-header-shell > h3 {
      position: relative !important;
      z-index: 1 !important;
      margin-top: 10px !important;
    }
    .rdv-export-root .rdv-pdf-body table {
      font-size: ${o}pt !important;
    }
    .rdv-export-root .rdv-pdf-body table th,
    .rdv-export-root .rdv-pdf-body table td {
      font-size: ${o}pt !important;
      text-align: center !important;
      vertical-align: middle !important;
      line-height: 1.1 !important;
      padding: ${i}px ${a}px !important;
    }
    .rdv-export-root .rdv-pdf-body table th > .rdv-pdf-cell-inner,
    .rdv-export-root .rdv-pdf-body table td > .rdv-pdf-cell-inner {
      position: relative !important;
      top: -0.1em !important;
    }
    .rdv-export-root .rdv-pdf-body .rdv-section-bar {
      font-size: ${o}pt !important;
      text-align: center !important;
    }
    .rdv-export-root .rdv-pdf-body .rdv-pdf-signature-block {
      font-size: ${s}pt !important;
      display: block !important;
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: 100% !important;
      margin-left: auto !important;
      margin-right: auto !important;
      margin-top: calc(2.5rem * ${d}) !important;
      margin-bottom: 5mm !important;
      padding-bottom: 6mm !important;
      text-align: center !important;
      line-height: 1.45 !important;
      overflow: visible !important;
    }
    .rdv-export-root .rdv-pdf-body .rdv-pdf-signature-block p {
      font-size: ${s}pt !important;
      text-align: center !important;
      line-height: 1.45 !important;
      margin: 0.2em 0 !important;
      padding-bottom: 0.15em !important;
    }
  `,e.head.appendChild(n)}function D(e,t,n){let r=Number.isFinite(n.mainTitleOffsetMm)?n.mainTitleOffsetMm:0,i=t.ownerDocument??e,a=i.querySelector(`.rdv-pdf-main-title`);a instanceof HTMLElement&&(a.style.setProperty(`margin-top`,`0`,`important`),a.style.setProperty(`margin-bottom`,`3mm`,`important`),a.style.setProperty(`position`,`relative`,`important`),a.style.setProperty(`z-index`,`5`,`important`),a.style.setProperty(`transform`,`translateY(${r}mm)`,`important`));let o=i.querySelector(`.rdv-pdf-header-shell`);o instanceof HTMLElement&&o.style.setProperty(`display`,`flow-root`,`important`)}function O(e){e.style.overflow=`visible`,e.style.maxHeight=`none`,e.style.height=`auto`,e.querySelectorAll(`*`).forEach(e=>{e.style.overflow=`visible`,e.style.maxHeight=`none`}),e.style.paddingBottom=`56px`;let t=e.scrollHeight;t>0&&(e.style.minHeight=`${t}px`,e.style.height=`${t}px`)}function k(e,t,n){return Math.min(n,Math.max(t,e))}function A(e,t){let n=e.marginMm,r=C(n),i=T(e);return{imgXMm:k(n+(r-i)/2+e.contentOffsetXMm,0,210-i),imgYMm:k(n+e.contentOffsetYMm,0,297-t),imageWMm:i}}function j(e,t,n){let r=t.marginMm,i=w(r),a=T(t),o=e.height*a/e.width;if(n>=o-.02)return null;let s=Math.min(i,o-n),c=n/o*e.height,l=s/o*e.height,u=Math.max(1,Math.round(l)),d=Math.min(Math.floor(c),Math.max(0,e.height-1)),f=document.createElement(`canvas`);f.width=e.width,f.height=u;let p=f.getContext(`2d`);if(!p)throw Error(`Canvas 2D não disponível para o PDF.`);p.fillStyle=`#ffffff`,p.fillRect(0,0,f.width,f.height);let m=Math.min(u,e.height-d);return p.imageSmoothingEnabled=!0,p.imageSmoothingQuality=`high`,p.drawImage(e,0,d,e.width,m,0,0,e.width,m),{slice:f,sliceHeightMm:s,nextOffsetMm:n+s}}function M(e,t,n){let r=0,i=0;for(;;){let a=j(t,n,r);if(!a)break;i>0&&e.addPage();let o=a.slice.toDataURL(x,S),{imgXMm:s,imgYMm:c,imageWMm:l}=A(n,a.sliceHeightMm);e.addImage(o,b,s,c,l,a.sliceHeightMm,void 0,`FAST`),r=a.nextOffsetMm,i+=1}}async function N(e){let t=document.createElement(`iframe`);t.setAttribute(`title`,`rdv-pdf-capture`),t.setAttribute(`aria-hidden`,`true`),t.style.cssText=`position:fixed;left:-99999px;top:0;width:210mm;height:12000px;border:0;margin:0;padding:0;`,document.body.appendChild(t),await new Promise((n,r)=>{let i=!1,a=()=>{i||(i=!0,n())};t.addEventListener(`load`,a,{once:!0}),t.addEventListener(`error`,()=>{i||(i=!0,r(Error(`Não foi possível preparar o PDF.`)))},{once:!0}),t.srcdoc=e,queueMicrotask(()=>{let e=t.contentDocument;(e?.getElementById(`rdv-export-root`)??e?.querySelector(`.rdv-export-root`))&&e?.readyState===`complete`&&a()})});let n=t.contentDocument;if(!n)throw Error(`Documento do iframe indisponível.`);let r=performance.now()+3e3,i=null;for(;performance.now()<r&&(i=n.getElementById(`rdv-export-root`)??n.querySelector(`.rdv-export-root`),!i);)await new Promise(e=>{requestAnimationFrame(()=>e())});if(!i)throw Error(`Conteúdo RDV não encontrado.`);return n.fonts?.ready&&await n.fonts.ready.catch(()=>{}),i.offsetHeight,{iframe:t,root:i}}async function P(e,t,n){let r=n?.html2canvasScale??t.html2canvasScale,i=y(e,{headerDateIso:n?.headerDateIso}),a=null;try{let{iframe:e,root:n}=await N(i);a=e;let o=Math.ceil(Math.max(n.scrollWidth,n.clientWidth,n.offsetWidth)),c=Math.ceil(Math.max(n.scrollHeight,n.clientHeight,n.offsetHeight));return await(0,s.default)(n,{scale:r,width:o,height:c,windowWidth:o,windowHeight:c,useCORS:!0,logging:!1,allowTaint:!0,backgroundColor:`#ffffff`,foreignObjectRendering:!1,onclone:(e,n)=>{E(e,t),D(e,n,t),O(n)}})}finally{a?.remove()}}async function F(e,t,n){let i=r(t),a=n?.maxHtml2canvasScale,o=await P(e,i,{html2canvasScale:a===void 0?i.html2canvasScale:Math.min(i.html2canvasScale,a)}),s=j(o,i,0),c=w(i.marginMm),l=s?.slice??o,u=s?s.sliceHeightMm:c,{imgXMm:d,imgYMm:f,imageWMm:p}=A(i,u);return{dataUrl:l.toDataURL(x,S),imgXMm:d,imgYMm:f,imageWMm:p,sliceHeightMm:u}}function I(e,t){let n=t.trim()||`SemData`;e.save(`${n}.pdf`)}async function L(e,t,r=a,i){let o=await P(e,r,{headerDateIso:i?.headerDateIso}),s=new n({orientation:`p`,unit:`mm`,format:`a4`,compress:!0});M(s,o,r),I(s,t)}async function R(e,t,r,i=a){let o=[...new Set(r.map(e=>e.trim()).filter(Boolean))];if(o.length===0)throw Error(`Nenhuma data informada para gerar o PDF.`);let s=new n({orientation:`p`,unit:`mm`,format:`a4`,compress:!0});for(let t=0;t<o.length;t++){let n=o[t],r=await P(e,i,{headerDateIso:n});t>0&&s.addPage(),M(s,r,i)}I(s,t)}export{F as buildRelatorioDiarioViaturasPdfPage1Preview,L as downloadRelatorioDiarioViaturasPdf,R as downloadRelatorioDiarioViaturasPdfMerged};