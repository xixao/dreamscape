/** Component families inspected in the supplied GitHub Annotation Toolkit Figma file. */
export const DESIGNER_KINDS = ['note','button','form','heading','landmark','link','list','mobile','media','metadata','ordering','feedback','table','interaction','post-it','ui-stamp'] as const;
export type DesignerKind = typeof DESIGNER_KINDS[number];
type Field = {key:string;label:string;options?:string[]};
const field=(key:string,label:string,options?:string[]):Field=>({key,label,...(options?{options}:{})});
const bool=['No','Yes'];
export const DESIGNER_KIT: Record<DesignerKind,{label:string;color:string;fields:Field[]}> = {
 note:{label:'Basic Note',color:'#8250DF',fields:[field('type','Type',['Note','Question','Concern']),field('description','Description'),field('date','Date'),field('issues','Possible issues'),field('dependencies','Dependencies'),field('recommendations','Recommendations'),field('plan','Path forward')]},
 button:{label:'Button',color:'#0969DA',fields:[field('name','Accessible name'),field('description','Description target (aria-describedby)'),field('submits','Submits form',bool)]},
 form:{label:'Form Element',color:'#6860DD',fields:[field('type','Form element',['Text Input','Text Area','Fieldset','Radio Button','Checkbox','Select','Range','Email Input','Number Input','Telephone Input','Date Input','Time Input','Other']),field('required','Required',bool),field('checked','Checked',bool),field('legend','Legend'),field('value','Default value'),field('error','Error message'),field('autocomplete','Autocomplete'),field('inputmode','Input mode'),field('disabled','Disabled',bool),field('description','Description target (aria-describedby)'),field('min','Minimum'),field('max','Maximum'),field('step','Step'),field('minlength','Minimum length'),field('maxlength','Maximum length'),field('pattern','Pattern'),field('rows','Rows'),field('cols','Columns'),field('datalist','Datalist values')]},
 heading:{label:'Heading',color:'#218B91',fields:[field('level','Heading level',['H1','H2','H3','H4','H5','H6']),field('heading','Heading text'),field('hidden','Visually hidden',bool),field('cssOnly','CSS styling only',bool),field('variable','Variable level',bool)]},
 landmark:{label:'Landmark',color:'#BF3989',fields:[field('element','Landmark',['Header','Navigation','Main','Section','Aside','Form','Footer']),field('name','Accessible name')]},
 link:{label:'Link',color:'#3851B5',fields:[field('name','Accessible name'),field('destination','Destination'),field('description','Description'),field('newWindow','Opens a new window',bool)]},
 list:{label:'List',color:'#5637B5',fields:[field('type','List type',['Ordered','Unordered','Description']),field('items','List items')]},
 mobile:{label:'Mobile Annotation',color:'#267F99',fields:[field('platform','Platform',['iOS','Android']),field('label','Label'),field('hint','Hint'),field('role','Role / trait'),field('value','Value'),field('actions','Actions')]},
 media:{label:'Media',color:'#34845D',fields:[field('type','Media type',['Image','Video','Audio']),field('name','Accessible name'),field('alt','Alt text'),field('decorative','Decorative',bool),field('captions','Captions'),field('transcript','Transcript'),field('description','Audio description')]},
 metadata:{label:'Metadata',color:'#855B58',fields:[field('pageTitle','Page title'),field('language','Page language')]},
 ordering:{label:'Ordering',color:'#BC581A',fields:[field('type','Order type',['Focus order','Reading order']),field('order','Order'),field('sequence','Order list')]},
 feedback:{label:'System Feedback',color:'#A32955',fields:[field('type','Feedback type',['Success','Warning','Error','Live region']),field('message','Message'),field('announcement','Announcement'),field('politeness','Live region',['Polite','Assertive','Off'])]},
 table:{label:'Table',color:'#277899',fields:[field('caption','Caption'),field('headers','Headers'),field('rows','Rows'),field('scope','Header scope'),field('description','Description')]},
 interaction:{label:'User Interaction',color:'#565B70',fields:[field('type','Interaction',['Keyboard','Touch','Mouse','Pointer']),field('trigger','Key / gesture'),field('behavior','Expected behavior'),field('focus','Focus destination')]},
 'post-it':{label:'Post-it',color:'#D4A72C',fields:[field('details','Note')]},
 'ui-stamp':{label:'UI Stamp',color:'#8250DF',fields:[field('label','Label'),field('status','Status')]},
};
