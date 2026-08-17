(() => {
  "use strict";

  const API =
    "https://dpmjwsnqkuzetyvfcmfr.supabase.co/functions/v1/special-survey-admin";
  const $ = id => document.getElementById(id);
  const tab = document.querySelector('[data-admin-tab="specialsurvey"]');
  const section = $("specialSurveyAdminSection");
  if (!tab || !section) return;

  const listHost=$("specialSurveyList"), statusHost=$("specialSurveyStatus"),
    editor=$("specialSurveyEditor"), editorTitle=$("specialSurveyEditorTitle"),
    idInput=$("specialSurveyId"), slugInput=$("specialSurveySlug"),
    defaultLang=$("specialSurveyDefaultLanguage"), enabledLangs=$("specialSurveyEnabledLanguages"),
    titleInputs={ko:$("specialSurveyTitleKo"),en:$("specialSurveyTitleEn"),ja:$("specialSurveyTitleJa"),ru:$("specialSurveyTitleRu")},
    descInputs={ko:$("specialSurveyDescKo"),en:$("specialSurveyDescEn"),ja:$("specialSurveyDescJa"),ru:$("specialSurveyDescRu")},
    identity=$("specialSurveyIdentity"), duplicate=$("specialSurveyDuplicate"),
    starts=$("specialSurveyStarts"), ends=$("specialSurveyEnds"),
    questionsHost=$("specialSurveyQuestions"), addQuestion=$("specialSurveyAddQuestion"),
    saveButton=$("specialSurveySave"), cancelButton=$("specialSurveyCancel"),
    results=$("specialSurveyResults"), resultsTitle=$("specialSurveyResultsTitle"),
    resultsHost=$("specialSurveyResultsHost"), exportButton=$("specialSurveyExportCsv"),
    closeResults=$("specialSurveyCloseResults");

  let surveys=[], resultSurvey=null, resultRows=[];

  function setStatus(msg="",err=false){statusHost.textContent=msg;statusHost.classList.toggle("error",err)}
  function token(){return window.S967AdminAuth?.getToken?.()||""}
  async function request(method="GET",body=null,query=""){
    const t=token(); if(!t)throw new Error("관리자 로그인이 필요합니다.");
    const opt={method,headers:{Authorization:`Bearer ${t}`}};
    if(body!==null){opt.headers["Content-Type"]="application/json";opt.body=JSON.stringify(body)}
    const r=await fetch(API+query,opt); const j=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(j.error||`HTTP_${r.status}`),{status:r.status,code:j.error});
    return j;
  }
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function localDate(value){if(!value)return "";try{return new Date(value).toLocaleString("ko-KR")}catch{return value}}
  function t(obj,lang="ko",fallback="ko"){return obj?.[lang]||obj?.[fallback]||Object.values(obj||{})[0]||""}

  async function load(){
    setStatus("불러오는 중…");
    const j=await request(); surveys=j.surveys||[]; renderList(); setStatus("");
  }
  function renderList(){
    listHost.replaceChildren();
    if(!surveys.length){listHost.innerHTML='<div class="small">아직 특수설문이 없습니다.</div>';return}
    for(const s of surveys){
      const card=document.createElement("div");card.className="group-buy-card";card.style.marginTop="10px";
      card.innerHTML=`<div class="row"><strong>${esc(t(s.title,s.default_language,s.default_language))}</strong><span class="small">${esc(s.status)} · 응답 ${Number(s.response_count||0).toLocaleString()}건</span></div>
        <div class="small">/${esc(s.slug)} · ${esc(s.identity_mode)} · ${esc(s.duplicate_policy)}</div>
        <div class="small">${s.starts_at?`시작 ${esc(localDate(s.starts_at))}`:""} ${s.ends_at?`/ 종료 ${esc(localDate(s.ends_at))}`:""}</div>`;
      const row=document.createElement("div");row.className="row";row.style.marginTop="10px";
      const buttons=[];
      if(s.status==="draft")buttons.push(["편집",()=>editSurvey(s)],["공개",()=>act("open",s)],["삭제",()=>act("delete",s)]);
      if(s.status==="open")buttons.push(["종료",()=>act("close",s)]);
      buttons.push(["결과",()=>showResults(s)],["복제",()=>act("duplicate",s)]);
      for(const [label,fn] of buttons){const b=document.createElement("button");b.type="button";b.textContent=label;b.onclick=fn;row.append(b)}
      card.append(row);listHost.append(card);
    }
  }

  function resetEditor(){
    idInput.value="";slugInput.value="";defaultLang.value="ko";
    [...enabledLangs.options].forEach(o=>o.selected=o.value==="ko");
    Object.values(titleInputs).forEach(x=>x.value="");Object.values(descInputs).forEach(x=>x.value="");
    identity.value="anonymous";duplicate.value="one_per_browser";starts.value="";ends.value="";
    questionsHost.replaceChildren();addQuestionRow();
  }
  function openNew(){resetEditor();editorTitle.textContent="새 특수설문";editor.classList.remove("hidden");results.classList.add("hidden");slugInput.focus()}
  function editSurvey(s){
    resetEditor();idInput.value=s.id;slugInput.value=s.slug;defaultLang.value=s.default_language;
    [...enabledLangs.options].forEach(o=>o.selected=(s.enabled_languages||[]).includes(o.value));
    for(const l of ["ko","en","ja","ru"]){titleInputs[l].value=s.title?.[l]||"";descInputs[l].value=s.description?.[l]||""}
    identity.value=s.identity_mode;duplicate.value=s.duplicate_policy;
    starts.value=toLocalInput(s.starts_at);ends.value=toLocalInput(s.ends_at);
    questionsHost.replaceChildren();for(const q of s.questions||[])addQuestionRow(q);
    editorTitle.textContent="특수설문 편집";editor.classList.remove("hidden");results.classList.add("hidden");
  }
  function toLocalInput(v){if(!v)return "";const d=new Date(v);const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,16)}
  function translations(inputs){const o={};for(const l of ["ko","en","ja","ru"]){const v=inputs[l]?.value?.trim();if(v)o[l]=v}return o}
  function makeId(prefix){return `${prefix}_${crypto.randomUUID().replaceAll("-","").slice(0,10)}`}

  function addQuestionRow(q={}){
    const box=document.createElement("div");box.className="group-buy-card";box.style.marginTop="12px";box.dataset.qid=q.id||makeId("q");
    box.innerHTML=`
      <div class="row">
        <select data-f="type">
          <option value="short_text">한 줄 입력</option><option value="long_text">긴 글 입력</option>
          <option value="single_choice">단일 선택</option><option value="multiple_choice">복수 선택</option>
          <option value="number">숫자</option><option value="yes_no">예/아니오</option>
        </select>
        <label><input data-f="required" type="checkbox"> 필수</label>
        <button data-action="up" type="button">↑</button><button data-action="down" type="button">↓</button>
        <button data-action="remove" type="button">삭제</button>
      </div>
      <div class="group-buy-form-row" style="margin-top:8px">
        <input data-label="ko" placeholder="질문 · 한국어"><input data-label="en" placeholder="Question · English">
        <input data-label="ja" placeholder="質問 · 日本語"><input data-label="ru" placeholder="Вопрос · Русский">
      </div>
      <div data-options></div>
      <div data-number class="row hidden" style="margin-top:8px">
        <input data-f="min" type="number" placeholder="최솟값"><input data-f="max" type="number" placeholder="최댓값">
      </div>`;
    box.querySelector('[data-f="type"]').value=q.type||"short_text";
    box.querySelector('[data-f="required"]').checked=q.required===true;
    for(const l of ["ko","en","ja","ru"])box.querySelector(`[data-label="${l}"]`).value=q.label?.[l]||"";
    if(q.min!=null)box.querySelector('[data-f="min"]').value=q.min;if(q.max!=null)box.querySelector('[data-f="max"]').value=q.max;
    const optionsHost=box.querySelector("[data-options]");
    function refreshType(){
      const type=box.querySelector('[data-f="type"]').value;
      const need=type==="single_choice"||type==="multiple_choice";
      optionsHost.classList.toggle("hidden",!need);box.querySelector("[data-number]").classList.toggle("hidden",type!=="number");
      if(need&&!optionsHost.children.length)addOption();
    }
    function addOption(o={}){
      const row=document.createElement("div");row.className="group-buy-form-row";row.style.marginTop="7px";row.dataset.oid=o.id||makeId("o");
      row.innerHTML=`<input data-ol="ko" placeholder="선택지 KO"><input data-ol="en" placeholder="Option EN"><input data-ol="ja" placeholder="選択肢 JA"><input data-ol="ru" placeholder="Вариант RU"><button type="button">×</button>`;
      for(const l of ["ko","en","ja","ru"])row.querySelector(`[data-ol="${l}"]`).value=o.label?.[l]||"";
      row.querySelector("button").onclick=()=>row.remove();optionsHost.insertBefore(row,optionsHost.querySelector("[data-add-option]"));
    }
    const add=document.createElement("button");add.type="button";add.dataset.addOption="1";add.textContent="+ 선택지";add.onclick=()=>addOption();optionsHost.append(add);
    for(const o of q.options||[])addOption(o);
    box.querySelector('[data-f="type"]').onchange=refreshType;
    box.querySelector('[data-action="remove"]').onclick=()=>box.remove();
    box.querySelector('[data-action="up"]').onclick=()=>box.previousElementSibling&&questionsHost.insertBefore(box,box.previousElementSibling);
    box.querySelector('[data-action="down"]').onclick=()=>box.nextElementSibling&&questionsHost.insertBefore(box.nextElementSibling,box);
    questionsHost.append(box);refreshType();
  }

  function collect(){
    const langs=[...enabledLangs.selectedOptions].map(o=>o.value);
    const qs=[...questionsHost.children].map(box=>{
      const type=box.querySelector('[data-f="type"]').value;
      const q={id:box.dataset.qid,type,required:box.querySelector('[data-f="required"]').checked,label:{}};
      for(const l of ["ko","en","ja","ru"]){const v=box.querySelector(`[data-label="${l}"]`).value.trim();if(v)q.label[l]=v}
      if(type==="single_choice"||type==="multiple_choice"){
        q.options=[...box.querySelectorAll("[data-oid]")].map(row=>{const o={id:row.dataset.oid,label:{}};for(const l of ["ko","en","ja","ru"]){const v=row.querySelector(`[data-ol="${l}"]`).value.trim();if(v)o.label[l]=v}return o})
      }
      if(type==="number"){const min=box.querySelector('[data-f="min"]').value,max=box.querySelector('[data-f="max"]').value;if(min!=="")q.min=Number(min);if(max!=="")q.max=Number(max)}
      return q;
    });
    return {
      slug:slugInput.value.trim(),default_language:defaultLang.value,enabled_languages:langs,
      title:translations(titleInputs),description:translations(descInputs),identity_mode:identity.value,
      duplicate_policy:duplicate.value,starts_at:starts.value?new Date(starts.value).toISOString():null,
      ends_at:ends.value?new Date(ends.value).toISOString():null,questions:qs
    };
  }

  async function save(){
    saveButton.disabled=true;setStatus("저장 중…");
    try{
      const id=idInput.value;await request("POST",{action:id?"update":"create",id,survey:collect()});
      editor.classList.add("hidden");await load();setStatus("저장했습니다.");
    }catch(e){setStatus(e.message,true)}finally{saveButton.disabled=false}
  }
  async function act(action,s){
    const msg={open:"이 설문을 공개할까요? 공개 후 질문 구조는 수정할 수 없습니다.",close:"이 설문을 종료할까요?",delete:"이 설문과 모든 응답을 삭제할까요?",duplicate:"이 설문을 초안으로 복제할까요?"}[action];
    if(msg&&!confirm(msg))return;
    try{setStatus("처리 중…");await request("POST",{action,id:s.id});await load();setStatus("완료했습니다.")}catch(e){setStatus(e.message,true)}
  }

  async function showResults(s){
    try{
      setStatus("결과를 불러오는 중…");const j=await request("GET",null,`?id=${encodeURIComponent(s.id)}&responses=1`);
      resultSurvey=j.survey;resultRows=j.responses||[];resultsTitle.textContent=`결과 · ${t(resultSurvey.title,resultSurvey.default_language,resultSurvey.default_language)} · ${resultRows.length}건`;
      renderResults();results.classList.remove("hidden");editor.classList.add("hidden");setStatus("");
    }catch(e){setStatus(e.message,true)}
  }
  function answerText(q,v){
    if(v==null)return "";
    if(q.type==="yes_no")return v?"Yes":"No";
    if(q.type==="single_choice"){const o=(q.options||[]).find(x=>x.id===v);return o?t(o.label,resultSurvey.default_language,resultSurvey.default_language):String(v)}
    if(q.type==="multiple_choice")return (Array.isArray(v)?v:[]).map(id=>{const o=(q.options||[]).find(x=>x.id===id);return o?t(o.label,resultSurvey.default_language,resultSurvey.default_language):id}).join(", ");
    return String(v);
  }
  function renderResults(){
    resultsHost.replaceChildren();
    if(!resultRows.length){resultsHost.innerHTML='<div class="small">응답이 없습니다.</div>';return}
    const wrap=document.createElement("div");wrap.style.overflowX="auto";const table=document.createElement("table");table.style.minWidth="900px";
    const qs=resultSurvey.questions||[];
    table.innerHTML=`<thead><tr><th>시각</th><th>응답자</th>${qs.map(q=>`<th>${esc(t(q.label,resultSurvey.default_language,resultSurvey.default_language))}</th>`).join("")}</tr></thead>`;
    const tb=document.createElement("tbody");
    for(const r of resultRows){const tr=document.createElement("tr");tr.innerHTML=`<td>${esc(localDate(r.created_at))}</td><td>${esc(r.respondent_label||r.respondent_kind||"익명")}</td>${qs.map(q=>`<td>${esc(answerText(q,r.answers?.[q.id]))}</td>`).join("")}`;tb.append(tr)}
    table.append(tb);wrap.append(table);resultsHost.append(wrap);
  }
  function csvCell(v){const s=String(v??"");return `"${s.replaceAll('"','""')}"`}
  function exportCsv(){
    if(!resultSurvey)return;const qs=resultSurvey.questions||[];
    const rows=[["created_at","respondent",...qs.map(q=>t(q.label,resultSurvey.default_language,resultSurvey.default_language))]];
    for(const r of resultRows)rows.push([r.created_at,r.respondent_label||r.respondent_kind||"anonymous",...qs.map(q=>answerText(q,r.answers?.[q.id]))]);
    const csv="\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=`special-survey-${resultSurvey.slug}.csv`;a.click();URL.revokeObjectURL(a.href);
  }

  $("specialSurveyNew").onclick=openNew;addQuestion.onclick=()=>addQuestionRow();saveButton.onclick=save;
  cancelButton.onclick=()=>editor.classList.add("hidden");closeResults.onclick=()=>results.classList.add("hidden");exportButton.onclick=exportCsv;
  tab.addEventListener("click",()=>load().catch(e=>setStatus(e.message,true)));
})();
