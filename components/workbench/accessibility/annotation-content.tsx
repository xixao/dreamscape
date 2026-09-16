import { annotationMeta, annotationFields, stampLabel, type Annotation } from '@/lib/accessibility/kit';

/** Native, editable annotation content. These overlays never enter the product component tree. */
export function AnnotationContent({annotation:a}: {annotation:Annotation}) {
  const meta=annotationMeta(a);
  const pill=<span style={{display:'inline-flex',alignItems:'center',gap:8,borderRadius:24,background:meta.color,color:'#fff',padding:'6px 12px',whiteSpace:'nowrap',fontSize:14,fontWeight:600}}>{stampLabel(a)}{a.showNumber&&<span style={{borderLeft:'1px solid #ffffff80',paddingLeft:8}}>{a.number}</span>}{a.resolved&&' ✓'}</span>;
  if(a.format==='pin'||a.format==='lasso'||a.format==='bracket') {
    const horizontal=a.position==='left'||a.position==='right';
    const reverse=a.position==='below'||a.position==='right';
    return <div style={{width:'100%',height:'100%',display:'flex',flexDirection:horizontal?(reverse?'row-reverse':'row'):(reverse?'column-reverse':'column'),alignItems:'center',justifyContent:'center',fontFamily:'Arial, sans-serif',opacity:a.resolved?.55:1}}>
      {pill}{a.position!=='center'&&<><span style={{flex:a.format==='pin'?1:undefined,background:meta.color,opacity:.45,width:horizontal?20:2,height:horizontal?2:20}}/>{a.format==='lasso'||a.format==='bracket'?<span style={{flex:1,alignSelf:'stretch',minWidth:20,minHeight:20,border:`2px ${a.format==='bracket'?'solid':'dashed'} ${meta.color}`,borderBottom:a.format==='bracket'?'none':undefined,background:`${meta.color}12`}}/>:<span style={{width:8,height:8,borderRadius:8,background:meta.color,flexShrink:0}}/>}</>}
    </div>;
  }
  if(a.format==='sticky')return <div style={{width:'100%',height:'100%',padding:20,background:'#FFF1B8',color:'#45330B',opacity:a.resolved?.65:1,boxShadow:'0 2px 4px #0002',fontFamily:'Arial, sans-serif',overflow:'auto',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}><strong>{a.resolved?'✓ ':''}{a.values.title||'Note'}</strong><p style={{marginTop:12}}>{a.values.details||'Add a note in the inspector.'}</p></div>;
  if(a.format==='summary')return <div style={{width:'100%',height:'100%',overflow:'auto',background:'#fff',color:'#202020',border:'1px solid #d4d4dc',borderRadius:16,padding:24,fontFamily:'Arial, sans-serif'}}>
    <div style={{color:'#246F99',fontWeight:700}}>A11y Team</div><h2 style={{fontSize:28,fontWeight:700,margin:'20px 0 8px'}}>Annotation Summary</h2><h3 style={{fontSize:20,fontWeight:700}}>{a.values.pageName||'Page name'}</h3><p>Annotated by {a.values.author||'Your name'}</p><p style={{fontSize:12,margin:'12px 0 24px'}}>Accessibility guidance for designers and developers, including screen reader and keyboard interactions.</p><h3 style={{fontWeight:700}}>{a.values.sectionTitle||'Section title'}</h3><p style={{marginTop:12,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{a.values.notes||'Add section notes in the inspector.'}</p>
  </div>;
  return <div style={{width:'100%',height:'100%',overflow:'auto',background:'#fff',color:'#202020',border:`1px solid ${meta.color}`,borderRadius:5,fontFamily:'Arial, sans-serif',fontSize:12,opacity:a.resolved?.65:1}}>
    <div style={{background:a.library==='designer'?'#fff':meta.color,color:a.library==='designer'?'#202020':'#fff',padding:'9px 12px',fontWeight:700,display:'flex',gap:8}}><span style={{background:a.library==='designer'?meta.color:'#fff',color:a.library==='designer'?'#fff':meta.color,padding:'0 5px',borderRadius:2}}>{a.number}</span>{a.values.title||meta.label}</div>
    <div style={{padding:12,display:'grid',gap:12}}><p style={{fontStyle:'italic',color:'#666'}}>{a.audience==='Default'?'Select audience':a.audience==='None'?'':`Audience: ${a.audience}`}</p>
      {annotationFields(a).filter(f=>a.library==='designer'?(!!a.values[f.key]&&f.key!=='title'):a.values[f.key]||(!['notes','code','hidden','cssOnly'].includes(f.key)&&f.key!=='title')).map(f=><div key={f.key}><div style={{fontWeight:700,marginBottom:3}}>{f.label}</div><div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',padding:f.key==='code'||f.key==='notes'?'5px 6px':undefined,background:f.key==='notes'?`${meta.color}22`:f.key==='code'?'#eef0f5':undefined,fontFamily:f.key==='code'?'monospace':undefined}}>{a.values[f.key]||`Add ${f.label.toLowerCase()}`}</div></div>)}
      <div style={{borderTop:'1px solid #ddd',paddingTop:10}}>{a.resolved?'☑ Resolved':'☐ Mark as resolved'}</div>
    </div>
  </div>;
}
