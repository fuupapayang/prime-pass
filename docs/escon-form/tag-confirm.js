/* PRIME PASS 引き継ぎタグ ①（確認画面で、3項目を読み取って、一時的に保存する）
 *
 * GTM の「カスタムHTML」タグに、そのまま貼り付けて使えます（前後を <script> と </script> で囲む）。
 * トリガー：確認画面の表示（カスタムイベント pp_form_confirm_view、または確認画面のURL）
 *
 * ここでは、サーバーへ送りません（確認画面で、お客様が「戻る」ことがあるため）。
 * 送信は、完了画面のタグ②（tag-thanks.js）が行います。
 * 読み取るのは、氏名・電話番号・メールアドレスの3項目と、ご関心のあるプロジェクト、同意の有無のみ。
 */
(function () {
  var n = function (name) { return 'input[name="input_model[' + name + ']"]'; };
  var v = function (name) { var e = document.querySelector(n(name)); return e ? String(e.value || '').trim() : ''; };
  var all = function (sel) { return [].slice.call(document.querySelectorAll(sel)); };
  var data = {
    name: (v('form_input_field1') + ' ' + v('form_input_field2')).trim(),                       // 姓 名
    phone: [v('form_input_field13_0'), v('form_input_field13_1'), v('form_input_field13_2')].filter(Boolean).join('-'), // 電話番号（3つの欄）
    email: v('form_input_field11'),                                                              // メールアドレス
    projects: all('input[name="input_model[form_input_field59][]"]').map(function (e) { return e.value; }).filter(Boolean), // ご関心あるプロジェクト
    consent: all('input[name="input_model[form_input_field28][]"]').some(function (e) { return e.value === '同意します'; }),
  };
  try { sessionStorage.setItem('pp.handover', JSON.stringify(data)); } catch (e) { /* 保存できない場合は、何もしない */ }
  if (window.__ppLog) window.__ppLog('①確認画面で読み取り', { 氏名: !!data.name, 電話番号: !!data.phone, メール: !!data.email, 関心プロジェクト: data.projects.length, 同意: data.consent });
})();
