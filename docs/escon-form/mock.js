/* エスコン プライムメンバーシップ ご登録フォーム（テスト用のまね）
 * 実際のフォーム（lmp1.net）と、同じ項目名（input_model[form_input_fieldN]）で作っています。
 * 目的：GTM（またはGA）のタグで、氏名・電話番号・メールアドレスが、アプリへ引き継がれるかを、安全に試すこと。
 * 架空の情報だけを入力してください。入力した内容は、アプリの登録以外には、使いません。
 */
const PREFS = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
const JOBS = '会社員 会社役員 経営者 医師 弁護士 会計士 教務員 公務員 自営業 商工自営業 専門職 無職 その他'.split(' ');
const INVEST = '株式 FX 投資信託 外貨預金 外国為替証拠金取引 公社債 不動産 不動産特定共同事業商品 変額保険 その他'.split(' ');
const BUDGET = '2億円以下 3億円以下 4億円以下 5億円以下 7億円以下 10億円以下 20億円以下 20億円超'.split(' ');
const HOUSE = '持家（マンション） 持家（戸建て） 賃貸（マンション） 賃貸（戸建て） 社宅/官舎/寮 親族と同居 その他'.split(' ');
const LDK = ['1LDK', '2LDK', '3LDK', '4LDK', '4LDK以上'];
const AREA_M2 = ['50㎡～', '60㎡～', '70㎡～', '80㎡～', '90㎡～', '100㎡～', '110㎡～', '120㎡～', '130㎡～', '140㎡～', '150㎡～', '200㎡～', '300㎡～', '500㎡～'];
const AREAS = ['首都圏', '中部', '関西', '九州・沖縄', '北海道', '海外'];
const PROJECTS = ['[北海道] エスコンフィールドタワー', '[首都圏] レ・ジェイド目黒', '[首都圏] グラン レ・ジェイド葉山', '[首都圏] (仮称)港区西麻布２丁目プロジェクト', '[首都圏] (仮称)港区南麻布４丁目プロジェクト', '[首都圏] (仮称)千代田区九段南１丁目プロジェクト', '[関西]レ・ジェイド大阪梅田', '[九州]（仮称）福岡市中央区唐人町プロジェクト', '[沖縄] レ・ジェイド那覇安里駅前[民泊対応型※一部住戸]', ' [海外] ハワイ　Alia /  Kuilei Place', '今後随時情報が欲しい'];

// 項目の定義（name は、実際のフォームと同じ）
const F = (name, label, o = {}) => ({ name, label, ...o });
export const FIELDS = [
  { group: 'お名前', req: true, items: [F('form_input_field1', '姓', { ph: '山田' }), F('form_input_field2', '名', { ph: '太郎' })] },
  { group: 'フリガナ', req: true, items: [F('form_input_field3', 'セイ', { ph: 'ヤマダ' }), F('form_input_field4', 'メイ', { ph: 'タロウ' })] },
  { group: '生年月日', req: true, birthday: true },
  { group: '家族人数', items: [F('form_input_field55', '', { w: 'sm' })] },
  { group: '郵便番号', req: true, items: [F('form_input_field5_0', '', { w: 'xs', ph: '000' }), '-', F('form_input_field5_1', '', { w: 'xs', ph: '0000' })] },
  { group: '都道府県', req: true, items: [F('form_input_field6', '', { select: PREFS })] },
  { group: '市区郡', req: true, items: [F('form_input_field7', '')] },
  { group: '町名・番地', req: true, items: [F('form_input_field8', '')] },
  { group: '建物名・号室', items: [F('form_input_field9', '')] },
  { group: '電話番号（携帯可）', req: true, hint: '例：00-0000-0000（半角数字）', items: [F('form_input_field13_0', '', { w: 'xs' }), '-', F('form_input_field13_1', '', { w: 'xs' }), '-', F('form_input_field13_2', '', { w: 'xs' })] },
  { group: 'メールアドレス', req: true, hint: '例：escon@es-conjapan.co.jp（半角英数）', items: [F('form_input_field11', '', { type: 'email' })] },
  { group: 'ご職業', req: true, items: [F('form_input_field21', '', { select: JOBS })] },
  { group: 'どこでこのサイトを知りましたか', req: true, items: [F('form_input_field23', '')] },
  { group: 'ご年収', req: true, unit: '万円', items: [F('form_input_field19', '', { w: 'sm' })] },
  { group: '金融資産（不動産を除く）', req: true, unit: '万円', items: [F('form_input_field131', '', { w: 'sm' })] },
  { group: '投資のご経験・ご興味のあるもの', req: true, items: [F('form_input_field132', '', { select: INVEST })] },
  { group: 'ご予算', req: true, items: [F('form_input_field46', '', { select: BUDGET })] },
  { group: '現在の住居形態', req: true, items: [F('form_input_field58', '', { select: HOUSE })] },
  { group: 'ご希望間取り', req: true, checks: { name: 'form_input_field52', values: LDK } },
  { group: 'ご希望面積', req: true, checks: { name: 'form_input_field53', values: AREA_M2 } },
  { group: 'ご希望エリア', req: true, checks: { name: 'form_input_field60', values: AREAS } },
  { group: 'ご関心あるプロジェクト', req: true, checks: { name: 'form_input_field59', values: PROJECTS, wide: true } },
];
const CONSENT = { name: 'form_input_field28', value: '同意します' };
const nm = (n) => `input_model[${n}]`;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'escon.form';
export const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (d) => sessionStorage.setItem(KEY, JSON.stringify(d));

/* ---------- テスト用パネル（実際のフォームには、ありません） ---------- */
const LOGKEY = 'pp.log';
window.__ppLog = (label, obj) => {
  try { const l = JSON.parse(sessionStorage.getItem(LOGKEY) || '[]'); l.push({ t: new Date().toLocaleTimeString('ja-JP'), label, obj }); sessionStorage.setItem(LOGKEY, JSON.stringify(l)); } catch { /* noop */ }
  renderPanel();
};
function renderPanel() {
  const el = document.getElementById('ppPanel'); if (!el) return;
  let l = []; try { l = JSON.parse(sessionStorage.getItem(LOGKEY) || '[]'); } catch { /* noop */ }
  const mode = gtmId() ? `GTM（${esc(gtmId())}）のタグで動かしています` : '内蔵のタグ（GTMと同じコード）で動かしています';
  el.innerHTML = `<div class="pp-title">テスト用の確認パネル　<span>※実際のフォームには、表示されません</span></div><div class="pp-mode">モード：${mode}</div>
    <div class="pp-log">${l.map((x) => `<div><b>${esc(x.t)}</b>　${esc(x.label)}${x.obj && Object.keys(x.obj).length ? '　<code>' + esc(JSON.stringify(x.obj)) + '</code>' : ''}</div>`).join('') || '<div class="muted">まだ記録はありません</div>'}</div>
    <div class="pp-ops"><button type="button" id="ppClear">記録を消す</button>　<a href="guide.html">GTMでの設定手順</a></div>`;
  const c = document.getElementById('ppClear'); if (c) c.onclick = () => { sessionStorage.removeItem(LOGKEY); renderPanel(); };
}

/* ---------- GTM（テスト用のコンテナID。本物のコンテナは、使いません） ---------- */
export const gtmId = () => { try { return localStorage.getItem('pp.gtm') || ''; } catch { return ''; } };
const q = new URLSearchParams(location.search);
if (q.has('gtm')) { try { const v = q.get('gtm').trim(); if (/^GTM-[A-Z0-9]{4,10}$/.test(v)) localStorage.setItem('pp.gtm', v); else if (v === '') localStorage.removeItem('pp.gtm'); } catch { /* noop */ } }
window.dataLayer = window.dataLayer || [];
if (gtmId()) {
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId())}`; document.head.appendChild(s);
}
// 画面の表示を、dataLayer のイベントとして知らせる。GTMがない場合は、同じコードのタグを、内蔵で実行する
export function fire(event, tagFile) {
  window.dataLayer.push({ event });
  window.__ppLog && window.__ppLog(`dataLayer：${event}`, {});
  if (!gtmId() && tagFile) { const s = document.createElement('script'); s.src = tagFile + '?v=' + Date.now(); document.body.appendChild(s); }
}

/* ---------- 入力画面 ---------- */
export function renderForm(root) {
  const d = load();
  const years = Array.from({ length: 128 }, (_, i) => 2027 - i);
  const row = (f) => {
    const label = `<div class="lb">${esc(f.group)}${f.req ? '<span class="req">必須</span>' : ''}</div>`;
    let body = '';
    if (f.birthday) body = `<div class="in"><select name="${nm('form_input_field16(1i)')}"><option value="">--</option>${years.map((y) => `<option ${d['form_input_field16(1i)'] == y ? 'selected' : ''}>${y}</option>`).join('')}</select>年 <select name="${nm('form_input_field16(2i)')}"><option value="">--</option>${Array.from({ length: 12 }, (_, i) => `<option ${d['form_input_field16(2i)'] == i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>月 <select name="${nm('form_input_field16(3i)')}"><option value="">--</option>${Array.from({ length: 31 }, (_, i) => `<option ${d['form_input_field16(3i)'] == i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>日</div>`;
    else if (f.checks) body = `<div class="in checks ${f.checks.wide ? 'wide' : ''}">${f.checks.values.map((v) => `<label><input type="checkbox" name="${nm(f.checks.name)}[]" value="${esc(v)}" ${(d[f.checks.name] || []).includes(v) ? 'checked' : ''}>${esc(v)}</label>`).join('')}</div>`;
    else body = `<div class="in">${f.items.map((it) => (typeof it === 'string' ? `<span class="dash">${it}</span>` : it.select ? `<select name="${nm(it.name)}" class="${it.w || ''}"><option value="">選択してください</option>${it.select.map((o) => `<option ${d[it.name] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : `<label class="sub">${it.label ? `<span>${esc(it.label)}</span>` : ''}<input type="${it.type || 'text'}" name="${nm(it.name)}" id="${nm(it.name).replace(/[\[\]]/g, '_')}" value="${esc(d[it.name] || '')}" class="${it.w || ''}" placeholder="${esc(it.ph || '')}"></label>`)).join('')}${f.unit ? `<span class="unit">${f.unit}</span>` : ''}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>`;
    return `<div class="row">${label}${body}</div>`;
  };
  root.innerHTML = `<form id="f" novalidate>${FIELDS.map(row).join('')}
    <div class="row"><div class="lb">個人情報の取り扱いについて<span class="req">必須</span></div><div class="in"><div class="hint" style="margin:0 0 8px">資料請求を行う際は必ず『個人情報保護方針』をお読みください。内容に同意していただけましたら、「同意します」にチェックしてお進みください。</div><label class="chk"><input type="checkbox" name="${nm(CONSENT.name)}[]" value="${CONSENT.value}" ${(d[CONSENT.name] || []).includes(CONSENT.value) ? 'checked' : ''}>同意します</label></div></div>
    <div class="err" id="err"></div><div class="actions"><button class="btn" type="submit">確認に進む</button> <button class="btn ghost" type="button" id="fill">架空の情報を入力する（テスト用）</button></div></form>`;
  const form = root.querySelector('#f');
  const val = () => {
    const o = {};
    new FormData(form).forEach((v, k) => { const m = k.match(/^input_model\[(.+?)\](\[\])?$/); if (!m) return; if (m[2]) (o[m[1]] = o[m[1]] || []).push(v); else o[m[1]] = v; });
    return o;
  };
  root.querySelector('#fill').onclick = () => {
    const n = String(Math.floor(1000 + Math.random() * 9000));
    const set = (name, v) => { const e = form.querySelector(`[name="${nm(name)}"]`); if (e) e.value = v; };
    set('form_input_field1', '山田'); set('form_input_field2', '太郎'); set('form_input_field3', 'ヤマダ'); set('form_input_field4', 'タロウ');
    set('form_input_field16(1i)', '1975'); set('form_input_field16(2i)', '4'); set('form_input_field16(3i)', '12'); set('form_input_field55', '3');
    set('form_input_field5_0', '107'); set('form_input_field5_1', '0062'); set('form_input_field6', '東京都'); set('form_input_field7', '港区'); set('form_input_field8', '南青山1-1-1');
    set('form_input_field13_0', '090'); set('form_input_field13_1', '0000'); set('form_input_field13_2', n);
    set('form_input_field11', `taro.${n}@example.com`);
    set('form_input_field21', '会社役員'); set('form_input_field23', '検索'); set('form_input_field19', '3000'); set('form_input_field131', '10000'); set('form_input_field132', '不動産'); set('form_input_field46', '5億円以下'); set('form_input_field58', '持家（マンション）');
    ['3LDK'].forEach((v) => { const e = form.querySelector(`[name="${nm('form_input_field52')}[]"][value="${v}"]`); if (e) e.checked = true; });
    ['100㎡～'].forEach((v) => { const e = form.querySelector(`[name="${nm('form_input_field53')}[]"][value="${v}"]`); if (e) e.checked = true; });
    ['首都圏'].forEach((v) => { const e = form.querySelector(`[name="${nm('form_input_field60')}[]"][value="${v}"]`); if (e) e.checked = true; });
    ['[首都圏] グラン レ・ジェイド葉山', '[首都圏] レ・ジェイド目黒'].forEach((v) => { const e = form.querySelector(`[name="${nm('form_input_field59')}[]"][value="${v}"]`); if (e) e.checked = true; });
    form.querySelector(`[name="${nm(CONSENT.name)}[]"]`).checked = true;
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const o = val(); const miss = [];
    FIELDS.forEach((f) => { if (!f.req) return; if (f.birthday) { if (!o['form_input_field16(1i)'] || !o['form_input_field16(2i)'] || !o['form_input_field16(3i)']) miss.push(f.group); } else if (f.checks) { if (!(o[f.checks.name] || []).length) miss.push(f.group); } else if (f.items.some((it) => typeof it !== 'string' && !(o[it.name] || '').trim())) miss.push(f.group); });
    if (!(o[CONSENT.name] || []).length) miss.push('個人情報の取り扱いについて');
    const em = o.form_input_field11 || ''; if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) miss.push('メールアドレス（形式）');
    if (miss.length) { root.querySelector('#err').textContent = `入力内容を、ご確認ください：${miss.join('、')}`; window.scrollTo(0, document.body.scrollHeight); return; }
    save(o); location.href = 'confirm.html';
  };
}

/* ---------- 確認画面 ---------- */
export function renderConfirm(root) {
  const d = load();
  if (!d.form_input_field1) { root.innerHTML = '<p>入力内容がありません。<a href="index.html">入力画面へ</a></p>'; return; }
  const show = (g, v) => `<div class="row"><div class="lb">${esc(g)}</div><div class="in"><b>${esc(v)}</b></div></div>`;
  const line = (f) => {
    if (f.birthday) return show(f.group, `${d['form_input_field16(1i)']}年${d['form_input_field16(2i)']}月${d['form_input_field16(3i)']}日`);
    if (f.checks) return show(f.group, (d[f.checks.name] || []).join('、'));
    return show(f.group, f.items.map((it) => (typeof it === 'string' ? it : d[it.name] || '')).join('') + (f.unit || ''));
  };
  // 確認画面にも、入力した値を、同じ項目名の hidden として持たせる（実際のフォームと同じ構造と想定）
  const hidden = Object.entries(d).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => `<input type="hidden" name="${nm(k)}[]" value="${esc(x)}">`) : [`<input type="hidden" name="${nm(k)}" value="${esc(v)}">`])).join('');
  root.innerHTML = `<form id="cf">${hidden}${FIELDS.map(line).join('')}${show('個人情報の取り扱いについて', '同意します')}<div class="actions"><button class="btn ghost" type="button" id="back">戻る</button> <button class="btn" type="submit">送信する</button></div></form>`;
  root.querySelector('#back').onclick = () => { location.href = 'index.html'; };
  root.querySelector('#cf').onsubmit = (e) => { e.preventDefault(); window.__ppLog && window.__ppLog('「送信する」を押しました', {}); location.href = 'thanks.html'; };
  fire('pp_form_confirm_view', 'tag-confirm.js');
}

/* ---------- 完了画面 ---------- */
export function renderThanks(root) {
  root.innerHTML = '<div class="pp-thanks-anchor"></div><div class="thanks"><h2>ご登録ありがとうございました</h2><p>ご登録いただいたメールアドレス宛に、確認のメールをお送りしました。</p></div>';
  fire('pp_form_thanks_view', 'tag-thanks.js');
}
export function renderChrome(step) {
  document.getElementById('steps').innerHTML = ['入力', '確認', '完了'].map((l, i) => `<div class="st ${i + 1 === step ? 'on' : ''}"><span>${i + 1}</span>${l}</div>`).join('');
  const p = document.getElementById('ppPanel'); if (p) renderPanel();
}
export function renderGtmBox(root) {
  const box = document.createElement('div'); box.className = 'gtmbox';
  box.innerHTML = `<b>テスト用の設定</b>　GTMのコンテナID：<input id="gtmin" placeholder="GTM-XXXXXXX（空欄＝内蔵のタグ）" value="${esc(gtmId())}"> <button type="button" id="gtmsave">保存</button><div class="hint">空欄のときは、GTMと同じコードのタグを、このページが、内蔵で実行します。コンテナIDを入れると、GTMのタグで動きます（設定手順は<a href="guide.html">こちら</a>）。</div>`;
  root.prepend(box);
  box.querySelector('#gtmsave').onclick = () => { const v = box.querySelector('#gtmin').value.trim(); if (v && !/^GTM-[A-Z0-9]{4,10}$/.test(v)) { alert('GTM-から始まるIDを入れてください'); return; } try { v ? localStorage.setItem('pp.gtm', v) : localStorage.removeItem('pp.gtm'); } catch { /* noop */ } location.reload(); };
}
