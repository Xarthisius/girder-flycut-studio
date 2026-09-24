/* Source template; build_dashboard.py inserts the existing builder and scoped styles. */
(function () {
    const View = girder.views.View;
    const request = async (url, method = 'GET', data) => {
        try {
            return await girder.rest.restRequest({url: `flycut/${url}`, method, data, error: null});
        } catch (error) {
            throw new Error(error.responseJSON?.message || 'Girder request failed.');
        }
    };
    const Dashboard = View.extend({
        render: function () {
            this.el.replaceChildren();
            const currentUser = girder.auth.getCurrentUser();
            if (!currentUser) {
                this.el.textContent = 'Sign in to Girder to use Flyer Studio.';
                return this;
            }
            const host = document.createElement('div');
            this.el.append(host);
            const mount = host.attachShadow({mode: 'open'});
            const style = document.createElement('style');
            style.textContent = ":host{--ink:#16221f;--muted:#66736f;--line:#d9dfdc;--paper:#f5f6f3;--white:#fff;--green:#235c4e;--mint:#dcebe5;--orange:#ef6c3c;--danger:#bd3d32;--shadow:0 18px 50px rgba(23,36,32,.09)}\n*{box-sizing:border-box}:host{display:block;margin:0;background:var(--paper);color:var(--ink);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}.topbar{height:76px;background:var(--white);border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 34px;position:sticky;top:0;z-index:20}.brand{display:flex;align-items:center;gap:12px;color:var(--ink);text-decoration:none;letter-spacing:.04em}.brand span:last-child{display:flex;flex-direction:column}.brand b{font-size:15px}.brand small{font-size:9px;letter-spacing:.23em;color:var(--muted)}.brand-mark{width:33px;height:33px;background:var(--green);border-radius:9px;display:flex;align-items:center;justify-content:center;gap:2px}.brand-mark i{display:block;width:4px;background:#fff;border-radius:3px}.brand-mark i:nth-child(1){height:10px}.brand-mark i:nth-child(2){height:19px}.brand-mark i:nth-child(3){height:14px}.top-actions{display:flex;align-items:center;gap:10px}.save-state{font-size:12px;color:var(--muted);margin-right:8px}.save-state span{display:inline-block;width:7px;height:7px;border-radius:50%;background:#54a87b;margin-right:6px}.button{border:0;border-radius:8px;padding:10px 15px;font:600 13px inherit;cursor:pointer}.button.primary{background:var(--green);color:#fff}.button.ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}.workspace{max-width:1480px;margin:auto;display:grid;grid-template-columns:minmax(520px,46%) 1fr;min-height:calc(100vh - 76px)}.form-pane{padding:45px 44px 80px;border-right:1px solid var(--line);min-width:0}.intro{margin-bottom:30px}.eyebrow{font-weight:750;font-size:11px;letter-spacing:.18em;color:var(--orange);margin:0 0 10px}.intro h1{font-family:Georgia,serif;font-size:36px;font-weight:500;letter-spacing:-.03em;margin:0 0 8px}.intro>p:last-child{color:var(--muted);margin:0}.form-section{background:var(--white);border:1px solid var(--line);border-radius:12px;margin-bottom:14px;overflow:hidden;box-shadow:0 3px 13px rgba(20,36,30,.025)}summary{list-style:none;display:flex;align-items:center;gap:11px;padding:18px 20px;cursor:pointer;font-weight:700}summary::-webkit-details-marker{display:none}summary>span:first-child{display:flex;align-items:center;gap:11px;flex:1}summary b{display:inline-grid;place-items:center;width:26px;height:26px;background:var(--mint);border-radius:7px;color:var(--green);font-size:11px}.chevron{font-size:13px;color:var(--muted);transition:.2s}.form-section:not([open]) .chevron{transform:rotate(180deg)}.section-count{font-weight:500;font-size:11px;color:var(--muted);background:#f1f3f1;border-radius:20px;padding:4px 9px}.section-body{padding:3px 20px 21px;border-top:1px solid #edf0ee}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:17px 18px;padding-top:19px}.field{font-size:12px;font-weight:700;letter-spacing:.01em;display:block}.required{color:var(--orange)}input,select{width:100%;height:42px;border:1px solid #ccd4d0;border-radius:8px;background:#fff;padding:0 12px;margin-top:7px;color:var(--ink);font:14px inherit;outline:none}input:focus,select:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(35,92,78,.1)}input.invalid,select.invalid{border-color:var(--danger)}.input-wrap{position:relative;display:block}.input-wrap input{padding-right:42px}.help{position:absolute;right:9px;top:16px;width:23px;height:23px;border-radius:50%;border:1px solid #bdc7c2;background:#fff;color:var(--muted);font-weight:800;cursor:help}.help:hover:after,.help:focus:after{content:attr(data-tip);position:absolute;right:-8px;bottom:31px;width:240px;background:var(--ink);color:#fff;padding:9px 11px;border-radius:7px;font:400 11px/1.4 inherit;text-align:left;z-index:5;box-shadow:var(--shadow)}.field-note,.error{display:block;font-weight:400;color:var(--muted);font-size:10px;margin-top:5px}.error,.section-error{color:var(--danger)}.laser-list{padding-top:15px}.laser-card{border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:11px;background:#fbfcfb}.laser-head{display:flex;align-items:center;gap:9px;margin-bottom:12px}.color-swatch{width:15px;height:15px;border-radius:50%;background:var(--swatch);box-shadow:0 0 0 3px #fff,0 0 0 4px #ccd4d0}.laser-name{font-weight:750;flex:1}.remove-btn{border:0;background:none;color:#89938f;cursor:pointer;font-size:18px;line-height:1}.remove-btn:hover{color:var(--danger)}.laser-grid{display:grid;grid-template-columns:1.35fr .7fr 1fr 1fr .7fr;gap:9px}.laser-grid label,.custom-row label{font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.07em}.laser-grid input,.custom-row input{margin-top:5px;height:36px}.color-input{padding:4px;height:36px}.dashed{width:100%;border:1px dashed #afbbb5;background:#f8faf8;color:var(--green);padding:11px}.dashed:hover{background:var(--mint)}.section-error{font-size:11px;margin:8px 0 0;min-height:0}.custom-list{padding-top:15px}.custom-row{display:grid;grid-template-columns:1fr 1fr 28px;gap:9px;align-items:end;margin-bottom:10px}.custom-row .remove-btn{height:36px}.viewer-pane{padding:45px 42px 80px;min-width:0}.tabs{display:flex;gap:25px;border-bottom:1px solid var(--line);margin-bottom:16px}.tab{border:0;background:none;padding:0 1px 13px;color:var(--muted);font:650 13px inherit;cursor:pointer;position:relative}.tab.active{color:var(--green)}.tab.active:after{content:\"\";height:2px;position:absolute;left:0;right:0;bottom:-1px;background:var(--green)}.viewer-panel{display:none;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow);min-height:650px}.viewer-panel.active{display:block}.viewer-toolbar{height:48px;border-bottom:1px solid var(--line);padding:0 18px;display:flex;align-items:center;justify-content:space-between;color:var(--muted);font:500 11px ui-monospace,monospace}.viewer-toolbar button{border:0;background:none;color:var(--green);font-weight:700;cursor:pointer}pre{margin:0;padding:25px;white-space:pre-wrap;overflow:auto;color:#30443e;font:12px/1.68 ui-monospace,SFMono-Regular,Menlo,monospace;max-height:calc(100vh - 230px)}.preview-head{height:67px;padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}.preview-head>div:first-child{display:flex;flex-direction:column}.preview-head span{font-size:8px;letter-spacing:.13em;color:var(--muted)}.preview-head strong{font-size:13px;margin-top:2px}.zoom-control{display:flex;align-items:center;gap:8px}.zoom-control button{width:25px;height:25px;border:1px solid var(--line);background:#fff;border-radius:5px;cursor:pointer}.zoom-control span{letter-spacing:0;font-size:9px;width:34px;text-align:center}.preview-stage{height:520px;background-color:#e9ece9;background-image:linear-gradient(#d8ddd9 1px,transparent 1px),linear-gradient(90deg,#d8ddd9 1px,transparent 1px);background-size:20px 20px;display:grid;place-items:center;overflow:hidden}.canvas{width:430px;height:430px;background:#fafbf9;border:1px solid #c8d0cc;position:relative;box-shadow:0 8px 22px rgba(26,42,36,.1);transition:transform .15s}.empty-preview{height:100%;display:grid;place-items:center;color:var(--muted);font-size:12px}.flyer{position:absolute;border:1.5px solid var(--layer);border-radius:50%;background:color-mix(in srgb,var(--layer) 9%,white);display:grid;place-items:center;color:var(--layer);font-size:7px;font-weight:750;min-width:14px;min-height:14px}.legend{height:48px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:10px}.legend-dot{width:7px;height:7px;border-radius:50%;display:inline-block;background:var(--green);margin-right:5px}.toast{position:fixed;bottom:24px;left:50%;transform:translate(-50%,20px);background:var(--ink);color:#fff;padding:10px 15px;border-radius:8px;opacity:0;pointer-events:none;transition:.2s;font-size:12px;z-index:40}.toast.show{opacity:1;transform:translate(-50%,0)}\n@media(max-width:1000px){.workspace{grid-template-columns:1fr}.form-pane{border-right:0;border-bottom:1px solid var(--line)}.viewer-pane{padding-top:25px}}@media(max-width:650px){.topbar{padding:0 16px}.save-state{display:none}.workspace .form-pane,.viewer-pane{padding-left:16px;padding-right:16px}.two-col{grid-template-columns:1fr}.laser-grid{grid-template-columns:1fr 1fr}.laser-grid label:first-child{grid-column:1/-1}.intro h1{font-size:30px}}\n\n/* Layer-focused laser settings */\n.laser-card.unused{background:#f2f3f2;border-style:dashed;opacity:.72}.unused-badge{font-size:9px;font-weight:750;text-transform:uppercase;letter-spacing:.06em;color:#68736f;background:#e3e6e4;padding:3px 7px;border-radius:12px}.laser-grid{grid-template-columns:.7fr .6fr .8fr .95fr 1.15fr 1fr .65fr;gap:8px}.laser-grid input[readonly]{background:#eef1ef;color:#59645f;font-weight:750}.flyer{font-size:8px;font-weight:800}.flyer.unconfigured{border-style:dashed;background:#f1f2f1;color:#68736f}\n@media(max-width:1200px){.laser-grid{grid-template-columns:repeat(4,1fr)}.laser-grid label:first-child{grid-column:auto}}@media(max-width:650px){.laser-grid{grid-template-columns:1fr 1fr}}\n\n.locked-color{display:flex;align-items:center;gap:7px;height:36px;margin-top:5px;padding:0 8px;border:1px solid #ccd4d0;border-radius:8px;background:#eef1ef}.locked-color i{display:block;width:20px;height:20px;border-radius:5px;background:var(--swatch);box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}.locked-color code{font-size:9px;color:#59645f}.dashed.surplus,.dashed.surplus:hover{background:#e4e7e5;border-color:#aeb5b1;color:#737c78}.excel-import{display:flex;align-items:center;gap:10px;margin-top:10px}.excel-import .button{white-space:nowrap}.excel-import small{font-size:10px;color:var(--muted)}\n@media(max-width:650px){.excel-import{align-items:stretch;flex-direction:column}}\n\n.assignment-controls{display:grid;grid-template-columns:180px 180px 1fr;gap:12px;align-items:end;padding:16px 0 2px}.assignment-controls p{margin:0 0 10px;color:var(--muted);font-size:10px}.repeat-input{display:flex;align-items:center;gap:7px}.repeat-input input{width:72px}.repeat-input span{font-size:11px;color:var(--muted);text-transform:none}.source-badge{font-size:9px;font-weight:750;text-transform:uppercase;letter-spacing:.06em;color:#245d50;background:#dcebe5;padding:3px 7px;border-radius:12px}.lock-btn{border:1px solid #b8c2bd;background:#fff;color:#52605a;border-radius:12px;padding:3px 8px;font-size:9px;font-weight:750;cursor:pointer}.locked-color{width:42px}.locked-color i{width:24px}.hidden{display:none!important}.laser-grid{grid-template-columns:repeat(4,minmax(0,1fr))}\n@media(max-width:850px){.assignment-controls{grid-template-columns:1fr 1fr}.assignment-controls p{grid-column:1/-1}}\n\n.source-badge.edited{color:#9d2f2f;background:#f5dddd}.default-badge{font-size:9px;font-weight:750;text-transform:uppercase;letter-spacing:.06em;color:#65551a;background:#f3ebc8;padding:3px 7px;border-radius:12px}.field-recommendations{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.recommend-field{border:1px solid #cbd4cf;background:#fff;color:var(--green);border-radius:15px;padding:5px 9px;font-size:10px;font-weight:650;cursor:pointer}.recommend-field:hover{background:var(--mint)}\n@media(max-width:650px){.laser-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.topbar{height:auto;min-height:76px;gap:8px}.brand small{display:none}.top-actions{gap:5px}.top-actions .button{padding:8px;font-size:11px}}\n.section-required-marker{color:var(--danger);font-size:17px;line-height:1;margin-left:-5px}.import-locked .laser-grid input:disabled{opacity:1;background:#e8ecea;color:#66706c;cursor:not-allowed}\n.drag-handle{color:#82908a;cursor:grab;font-size:19px;line-height:1;user-select:none}.drag-handle:active{cursor:grabbing}.laser-card.dragging{opacity:.35}.laser-card.drag-over{border-color:var(--green);box-shadow:0 0 0 2px rgba(35,92,78,.13)}\n.flyer{background:var(--material,color-mix(in srgb,var(--layer) 9%,white))}\n\n.checkbox-field input[type=checkbox]{width:18px;height:18px;margin:8px 8px 8px 0;vertical-align:middle;accent-color:var(--green)}\n.assignment-controls .checkbox-field{padding-bottom:4px}.template-setting{border-style:dashed;background:#edf0ee}.template-setting .laser-grid input[type=number]{color:var(--muted);background:#eef1ef}\n\n.section-subtitle{font-size:13px;font-weight:650;color:#596e64;margin:20px 0 12px;letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:12px}.section-subtitle:after{content:\"\";height:1px;flex:1;background:#e0e7e3}\n.assignment-controls{grid-template-columns:minmax(170px,1fr) minmax(170px,1fr);padding-top:0;gap:16px}.assignment-controls .checkbox-field{display:flex;align-items:center;min-height:42px;margin:0;padding:0;white-space:nowrap}.laser-grid .layer-enabled{display:flex;flex-direction:column}.laser-grid .checkbox-control{display:flex;align-items:center;justify-content:flex-start;height:36px;margin-top:5px}.laser-grid .checkbox-control input[type=checkbox]{width:18px;height:18px;margin:0}.template-setting .laser-grid input:disabled{background:#eef1ef;color:var(--muted)}\n\n.overflow-enabled>span:first-child{text-decoration:line-through}.overflow-enabled .checkbox-control{position:relative}.overflow-enabled .checkbox-control:after{content:\"\";position:absolute;left:0;top:17px;width:20px;height:2px;background:var(--muted);transform:rotate(-45deg);pointer-events:none}\n\n\n#jsonPanel{min-height:0;border:1px solid #bccbc3;border-radius:12px;background:#fff;overflow:hidden;box-shadow:0 3px 14px rgba(20,36,30,.05)}\n#jsonPanel .viewer-toolbar{background:#f1f5f2;flex-shrink:0}\n#jsonOutput{margin:12px;max-height: min(60vh,640px);padding:16px 18px 28px;border:1px solid #e0e7e3;border-radius:7px;background:#fafcfb;overflow:auto;scrollbar-gutter:stable;overflow-wrap:anywhere}\n#jsonOutput:focus-visible{outline:2px solid var(--green);outline-offset:2px}\n\nbutton.save-state{border:0;background:transparent;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:6px}.save-state[data-status=incomplete] span{background:#b74c40}.save-state[data-status=needs-validation] span{background:#bf872a}.status-panel{padding:24px;min-height:0}.status-panel h2{font-size:20px;margin:0 0 24px}.status-panel h3{font-size:13px;color:var(--muted);margin:20px 0 12px}.status-panel ul{list-style:none;margin:0;padding:0}.status-panel li{padding:10px 0;border-bottom:1px solid var(--line);line-height:1.6}.status-panel .met{color:var(--green)}.status-panel .unmet{color:var(--danger)}@media(max-width:650px){button.save-state{display:block}.legend{height:auto;min-height:48px;gap:12px;flex-wrap:wrap;padding:12px}}\n\nbutton.save-state{text-decoration:none}.tabs{display:flex;gap:4px;padding:5px;border:1px solid var(--line);border-radius:10px;background:#eaf0ec;margin-bottom:18px}.tabs .tab{flex:1;border:0;border-radius:7px;padding:10px 16px;background:transparent;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}.tabs .tab.active{background:white;color:var(--green);box-shadow:0 1px 4px #183a2520}.tabs .tab:after{display:none}.violation-link{display:block;width:100%;text-align:left;border:0;background:none;color:var(--ink);padding:8px 2px;font:inherit;cursor:pointer}.violation-link:hover{color:var(--green);background:var(--mint)}.violation-kind{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px}.violation-focus{outline:2px solid var(--green)!important;outline-offset:4px;scroll-margin-top:130px}.legend{justify-content:flex-end}\n\n.field-label{display:inline-flex;align-items:center;gap:6px;min-height:20px}.field-label .help{position:relative;top:auto;right:auto;width:17px;height:17px;padding:0;font-size:10px;line-height:15px;flex:none}.field-label .help:hover:after,.field-label .help:focus:after{left:0;right:auto;bottom:25px}.input-wrap input{padding-right:12px}.assignment-controls .checkbox-field{align-self:center;min-height:0;transform:translateY(-3px)}.assignment-controls .checkbox-field input[type=checkbox]{margin:0 8px 0 0}.help{z-index:2}\n\n.help:hover:after,.help:focus:after,.field-label .help:hover:after,.field-label .help:focus:after{content:none}.floating-help{position:fixed;z-index:10000;max-width:min(280px,calc(100vw - 20px));padding:10px 12px;border-radius:8px;background:var(--ink);color:#fff;font:12px/1.5 ui-sans-serif,system-ui,sans-serif;box-shadow:0 4px 16px #0003;pointer-events:none}\n\n.color-field>span{font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.07em}.hex-toggle{width:100%;cursor:pointer}.hex-editor{font-family:ui-monospace,monospace;font-size:11px;padding:0 5px;min-width:75px}\n\n.color-field{display:flex;flex-direction:column;align-items:flex-start}.color-field>span{line-height:13px}.hex-toggle.locked-color{width:36px;height:36px;min-height:36px;justify-content:center;padding:7px;margin-top:5px}.hex-toggle i{width:20px;height:20px;flex:none}.wheel-editor{width:36px;height:32px;padding:2px;margin-top:6px}.hex-editor{width:90px}\n\n.validation-ack{display:flex;align-items:flex-start;gap:10px;margin-top:24px;padding:16px;background:var(--mint);border-radius:10px;font-size:13px;line-height:1.5}.validation-ack input{width:18px;height:18px;flex:none;margin:1px 0 0}.save-state[data-status=\"validated\"]{color:var(--green)}\n\n.color-controls{display:flex;align-items:center;gap:6px;margin-top:5px;width:100%;min-width:0}.color-controls .wheel-editor{flex:0 0 36px;width:36px;height:36px;margin:0;padding:7px;border-radius:8px;background:#eef1ef;cursor:pointer}.wheel-editor::-webkit-color-swatch-wrapper{padding:0}.wheel-editor::-webkit-color-swatch{border:0;border-radius:4px}.wheel-editor::-moz-color-swatch{border:0;border-radius:4px}.color-controls .hex-editor{flex:1;width:76px;min-width:0;max-width:90px;height:36px;margin:0;font-size:10px;padding:0 4px}optgroup{font-weight:700}\n.workflow-home{max-width:1180px;margin:0 auto;padding:64px 36px 90px}.workflow-home h1{font:500 38px Georgia,serif;letter-spacing:-.025em;margin:12px 0}.workflow-intro{color:var(--muted);font-size:15px;margin-bottom:32px}.saved-picker{max-width:620px}.workflow-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:34px}.workflow-card{display:flex;flex-direction:column;align-items:flex-start;border:1px solid var(--line);border-radius:14px;background:white;padding:26px;min-height:270px}.step-number{font-size:12px;font-weight:700;color:var(--green);background:var(--mint);border-radius:8px;padding:7px 10px}.workflow-card h2{font-size:20px;margin:22px 0 8px}.workflow-card p{color:var(--muted);line-height:1.6;flex:1;margin:0 0 24px}.workflow-card .button{text-decoration:none;display:inline-block}.completed-link{background:#e9eeeb;color:#53645c;border:1px solid #cdd7d1}.completed-link:hover{background:var(--mint);color:var(--green)}button:disabled{opacity:.45;cursor:not-allowed}.artifact-links{display:flex;flex-wrap:wrap;gap:16px;margin-top:20px}.artifact-links a{color:var(--green);font-size:12px}.workflow-home #runStatus{margin-top:24px}.builder-nav{padding:12px 32px;display:flex;gap:12px;align-items:center;background:#eaf0ec;border-bottom:1px solid var(--line)}#builderMode{color:var(--muted);font-size:12px}#configFields{border:0;padding:0;margin:0;min-width:0}#builderScreen.read-only .drag-handle{pointer-events:none;opacity:.4}#builderScreen.read-only #configFields{opacity:.8}.topbar{height:auto;min-height:76px;flex-wrap:wrap}.top-actions{flex-wrap:wrap}@media(max-width:800px){.workflow-cards{grid-template-columns:1fr}.workflow-home{padding:32px 20px}.workflow-card{min-height:220px}}\n\n.workflow-card.unavailable{background:#f2f4f2;color:#7b8580}.workflow-card.unavailable .step-number{background:#e6eae7;color:#7b8580}\n\n.builder-nav{flex-wrap:wrap;gap:10px}#saveAsName{width:240px;max-width:45vw;height:38px;margin:0}#backWorkflowBtn{font-size:20px;line-height:18px;padding:10px 13px}\n\n.template-picker-row{display:flex;gap:8px;align-items:center;min-width:0;margin-top:7px}.template-picker-row select{flex:1;min-width:0;margin-top:0}.template-picker-row button{flex:0 0 38px;height:42px;padding:0;font-size:22px;line-height:1}\n\n.workflow-choices{margin-top:0}.workflow-choice{min-height:180px;border:1px solid var(--line);border-radius:14px;background:white;color:var(--ink);font:500 24px Georgia,serif;padding:30px;cursor:pointer}.workflow-choice:hover:not(:disabled){border-color:var(--green);background:var(--mint)}.workflow-choice:disabled{background:#f2f4f2}.picker-continue{margin-top:24px}#runStatus:empty,#artifacts:empty{display:none}#runStatus{margin:20px 36px}\n\n.workflow-choice{display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:20px}.workflow-choice strong{font-weight:500}.workflow-choice small{font:400 13px/1.6 system-ui;color:var(--muted)}.template-picker-row input{flex:1;min-width:0;margin-top:0}#stackid[readonly]{background:#e8edea;color:#64736b}#autoStackIdBtn[aria-pressed=\"true\"]{background:var(--mint);border-color:var(--green)}\n\n#autoStackIdBtn{flex-basis:52px;font:700 10px/1 system-ui;letter-spacing:.04em}.brand small{text-transform:uppercase}.topbar .brand b{white-space:nowrap}\n\n.settings-screen { max-width: 800px; text-align: left; }\n.settings-screen .field { margin: 14px 0; }\n.settings-screen h2 { margin-top: 28px; }\n.settings-screen ul { padding-left: 20px; }\n.settings-screen li .button { margin-left: 10px; padding: 3px 8px; }\n\n.workflow-choices{grid-template-columns:repeat(3,minmax(0,1fr))}#completeWorkflowBtn{grid-column:1/-1;min-height:145px;background:var(--green);color:white;border:2px solid var(--green);box-shadow:0 5px 18px #163d2820}#completeWorkflowBtn small{color:inherit;opacity:.9}#completeWorkflowBtn:hover:not(:disabled){background:#234c38;color:white}#completeWorkflowBtn .step-number{background:white;color:var(--green)}@media(max-width:800px){.workflow-choices{grid-template-columns:1fr}}\n";
            mount.append(style);
            const container = document.createElement('div');
            container.innerHTML = "<header class=\"topbar\">\n    <a class=\"brand\" href=\"#\" id=\"studioHomeLink\" aria-label=\"Flyer Studio home\">\n      <span class=\"brand-mark\" aria-hidden=\"true\"><i></i><i></i><i></i></span>\n      <span><b>FLYER STUDIO</b><small id=\"currentPageLabel\">Home</small></span>\n    </a>\n    <div class=\"top-actions hidden\" id=\"builderActions\">\n      <button id=\"saveState\" type=\"button\" class=\"save-state\" aria-controls=\"statusPanel\"><span></span> Incomplete</button>\n      <input id=\"jsonFile\" type=\"file\" accept=\"application/json,.json\" hidden>\n      <button id=\"resetBtn\" class=\"button ghost\" type=\"button\">Delete</button><button id=\"submitConfigBtn\" class=\"button primary\" type=\"button\">Submit</button>\n    </div>\n  </header><section id=\"workflowHome\" class=\"workflow-home\">\n  <h1>Choose a module</h1>\n  <button id=\"adminSettingsBtn\" class=\"button ghost hidden\" type=\"button\">Admin settings</button>\n  <div class=\"workflow-cards workflow-choices\">\n    <button id=\"configurationStepBtn\" class=\"workflow-choice\" type=\"button\"><span class=\"step-number\">01</span><strong>Configuration</strong><small>Build, edit, or view configurations.</small></button>\n    <button id=\"lightburnStepBtn\" class=\"workflow-choice\" type=\"button\"><span class=\"step-number\">02</span><strong>Generation</strong><small>Generate stack identity files from submitted configs</small></button>\n    <button id=\"registerBtn\" class=\"workflow-choice\" type=\"button\"><span class=\"step-number\">03</span><strong>Registration</strong><small>Register stack IGSN from file identity files.</small></button>\n    <button id=\"completeWorkflowBtn\" class=\"workflow-choice\" type=\"button\"><span class=\"step-number\">1\u20133</span><strong>Complete Workflow</strong><small>Configure a stack, then submit to generate files and register its IGSN automatically.</small></button>\n  </div>\n</section>\n<section id=\"configurationPicker\" class=\"workflow-home hidden\">\n  <button id=\"configPickerBackBtn\" class=\"button ghost\" type=\"button\" aria-label=\"Back to workflow\">\u2190</button>\n  <h1 id=\"configurationPickerTitle\">Configuration</h1>\n  <p id=\"completeWorkflowHint\" class=\"workflow-intro hidden\">After submission, files are generated and the stack IGSN is registered automatically. Keep this page open until completion.</p>\n  <label class=\"field saved-picker\">Saved configuration\n    <select id=\"savedConfigs\"><option value=\"\">New configuration</option></select>\n  </label>\n  <label id=\"presetPicker\" class=\"field saved-picker hidden\">Preset<select id=\"presetSelect\" disabled><option value=\"\">No preset</option></select></label>\n  <button id=\"buildConfigBtn\" class=\"button primary picker-continue\" type=\"button\">Build config</button>\n</section>\n<section id=\"lightburnPicker\" class=\"workflow-home hidden\">\n  <button id=\"lightburnPickerBackBtn\" class=\"button ghost\" type=\"button\" aria-label=\"Back to workflow\">\u2190</button>\n  <h1>Generation</h1>\n  <label class=\"field saved-picker\">Submitted configuration\n    <select id=\"submittedConfigs\"><option value=\"\">Choose a submitted configuration</option></select>\n  </label>\n  <p id=\"filesHint\" class=\"field-note\"></p>\n  <a id=\"generatedFolderLink\" class=\"button ghost hidden\" target=\"_blank\" rel=\"noopener\">View files \u2197</a><button id=\"deleteFilesBtn\" class=\"button ghost hidden\" type=\"button\">Delete generated files</button>\n  <button id=\"generateBtn\" class=\"button primary picker-continue\" type=\"button\" disabled>Generate files</button>\n</section>\n<section id=\"registrationPicker\" class=\"workflow-home hidden\">\n  <button id=\"registrationBackBtn\" class=\"button ghost\" type=\"button\" aria-label=\"Back to workflow\">\u2190</button>\n  <h1>Registration</h1>\n  <p class=\"workflow-intro\">Create a stack IGSN linked to the selected foil IGSN in Girder.</p>\n  <label class=\"field saved-picker\">Generated configuration<select id=\"registrationConfigs\"></select></label>\n  <p id=\"registrationHint\" class=\"field-note\"></p>\n  <a id=\"viewIgsnLink\" class=\"button ghost hidden\" target=\"_blank\" rel=\"noopener\">View IGSN \u2197</a>\n  <button id=\"registerStackBtn\" class=\"button primary picker-continue\" type=\"button\">Register stack IGSN</button>\n</section>\n<p id=\"runStatus\" role=\"status\" aria-live=\"polite\"></p>\n<div id=\"artifacts\" class=\"artifact-links\"></div>\n\n<section id=\"adminSettingsScreen\" class=\"workflow-home settings-screen hidden\">\n  <button id=\"adminSettingsBack\" class=\"button ghost\" type=\"button\">\u2190 Back to workflow</button>\n  <h1>Flyer Studio settings</h1>\n  <p>Settings apply to new configurations and IGSNs. Existing files keep their location and permissions.</p>\n  <h2>Shared workspace</h2>\n  <label class=\"field\">Collection<select id=\"workspaceCollection\"></select></label>\n  <button id=\"browseWorkspaceBtn\" class=\"button ghost\" type=\"button\">Choose workspace folder</button>\n  <label class=\"field\">Workspace path<input id=\"workspacePath\" placeholder=\"/collection/Flyer Studio/Workspace\"></label>\n  <p class=\"field-note\">Choose a folder inside a collection. Collaborators also need access to that destination; the settings below do not change the collection\u2019s permissions.</p>\n  <h2>Users and groups</h2>\n  <label class=\"field\">Find a user or group<input id=\"principalSearch\" placeholder=\"Search by name\"></label>\n  <button id=\"findPrincipalsBtn\" class=\"button ghost\" type=\"button\">Search</button>\n  <label class=\"field\">Results<select id=\"principalResults\"></select></label>\n  <label class=\"field\">Add to<select id=\"principalRole\"><option value=\"creators\">IGSN creators</option><option value=\"owners\">Owners</option><option value=\"editors\">Editors</option><option value=\"viewers\">Viewers</option></select></label>\n  <button id=\"addPrincipalBtn\" class=\"button ghost\" type=\"button\">Add user or group</button>\n  <div id=\"policyLists\"></div>\n  <p class=\"field-note\">Creators are attribution only. Groups appear as organizational creators. Owners can manage access; editors can modify data; viewers can read. The highest matching access level wins.</p>\n  <h2>Acting user</h2>\n  <label class=\"field checkbox-field\"><input id=\"creators_include_user\" type=\"checkbox\">Include the registrant as an IGSN creator</label>\n  <label class=\"field checkbox-field\"><input id=\"owners_include_user\" type=\"checkbox\">Include the acting user as an owner</label>\n  <label class=\"field checkbox-field\"><input id=\"editors_include_user\" type=\"checkbox\">Include the acting user as an editor</label>\n  <label class=\"field checkbox-field\"><input id=\"viewers_include_user\" type=\"checkbox\">Include the acting user as a viewer</label>\n  <h2>Visibility</h2>\n  <label class=\"field checkbox-field\"><input id=\"public_igsn\" type=\"checkbox\">Make new stack IGSNs public</label>\n  <label class=\"field checkbox-field\"><input id=\"public_files\" type=\"checkbox\">Make new configuration folders and files public</label>\n  <p class=\"field-note\">IGSN access uses the same owners, editors, and viewers. Parent foil permissions remain unchanged.</p>\n  <button id=\"saveAdminSettingsBtn\" class=\"button primary\" type=\"button\">Save settings</button>\n  <p id=\"settingsStatus\" role=\"status\"></p>\n</section>\n<div id=\"builderScreen\" class=\"hidden\"><nav class=\"builder-nav\"><button id=\"backWorkflowBtn\" type=\"button\" class=\"button ghost\" aria-label=\"Back to workflow\" title=\"Back to workflow\">\u2190</button><input id=\"saveAsName\" type=\"text\" placeholder=\"Save as\u2026\" aria-label=\"Save as\" maxlength=\"160\"><button id=\"saveGirderBtn\" class=\"button primary\" type=\"button\">Save</button><span id=\"builderMode\" aria-live=\"polite\"></span><button id=\"editCopyBtn\" type=\"button\" class=\"button ghost hidden\">Edit a copy</button></nav>\n  \n\n  <main class=\"workspace\">\n    <section class=\"form-pane\" aria-label=\"Configuration form\">\n      <div class=\"intro\">\n        <h1>Configure Flyer Stack</h1>\n      </div>\n\n      <form id=\"configForm\" novalidate><fieldset id=\"configFields\">\n        <details open class=\"form-section\">\n          <summary><span><b>01</b> Run Parameters <span id=\"runRequiredMarker\" class=\"section-required-marker hidden\" aria-label=\"Required fields incomplete\">*</span></span><span class=\"chevron\">\u2303</span></summary>\n          <div class=\"section-body two-col\">\n            <label class=\"field\" for=\"stackid\"><span class=\"field-label\">Stack ID <span class=\"required\">*</span> <button type=\"button\" class=\"help\" data-tip=\"A unique stack identifier: a 5-character Crockford ID or legacy F### / F#### ID. Other values require confirmation.\" aria-label=\"Stack ID help\">?</button></span>\n              <div class=\"template-picker-row\"><input id=\"stackid\" name=\"stackid\" placeholder=\"e.g. 00005\" required><button id=\"autoStackIdBtn\" class=\"button ghost\" type=\"button\" aria-label=\"Assign lowest available Stack ID\" aria-pressed=\"false\" title=\"Assign lowest available Stack ID\">AUTO</button></div>\n              <small class=\"error\" id=\"stackidError\"></small>\n            </label>\n            <label class=\"field\" for=\"operator\"><span class=\"field-label\">Operator <button type=\"button\" class=\"help\" data-tip=\"The person preparing and running this stack.\" aria-label=\"Operator help\">?</button></span>\n              <span class=\"input-wrap\"><input id=\"operator\" name=\"operator\" list=\"operatorNames\" autocomplete=\"off\" placeholder=\"Name or initials\"></span>\n              <datalist id=\"operatorNames\"></datalist>\n              <small class=\"error\" id=\"operatorError\"></small>\n            </label>\n            <label class=\"field\"><span class=\"field-label\">Foil material <span class=\"required\">*</span></span>\n              <select id=\"foilMaterial\" name=\"foil_material\"><option value=\"\">Loading materials\u2026</option></select>\n              <small id=\"materialMeta\" class=\"field-note\">Foil IGSNs from Girder</small>\n            </label>\n            <label class=\"field\" for=\"template\"><span class=\"field-label\">Template <span class=\"required\">*</span> <button type=\"button\" class=\"help\" aria-label=\"Template help\" data-tip=\"Choose the LightBurn layout whose flyer positions and laser layers will be configured.\">?</button></span>\n              <div class=\"template-picker-row\"><select id=\"template\" name=\"template\"><option value=\"\">Loading templates\u2026</option></select><button id=\"browseTemplateBtn\" type=\"button\" class=\"button ghost\" aria-label=\"Choose template from portal\" title=\"Choose template from portal\">+</button></div>\n              <small id=\"templateMeta\" class=\"field-note\"></small>\n            </label>\n          </div>\n        </details>\n\n        <details open class=\"form-section\">\n          <summary><span><b>02</b> Laser Parameters</span><span class=\"section-count\" id=\"laserCount\">1 / 28</span><span class=\"chevron\">\u2303</span></summary>\n          <div class=\"section-body\">\n            <h3 class=\"section-subtitle\">Selection style</h3>\n            <div class=\"assignment-controls\">\n              <label class=\"field checkbox-field\" for=\"allowWraparound\"><input id=\"allowWraparound\" type=\"checkbox\" checked> <span class=\"field-label\">Wraparound <button type=\"button\" class=\"help\" aria-label=\"Wraparound help\" data-tip=\"Start again at the first setting when the template has more layers than the listed settings cover.\">?</button></span></label>\n              <label id=\"repeatWrap\" class=\"field\" for=\"repeatX\"><span class=\"field-label\">Repeat each setting for <button type=\"button\" class=\"help\" aria-label=\"Repeat each setting help\" data-tip=\"Apply each listed setting to this many consecutive template layers before moving to the next setting.\">?</button></span>\n                <span class=\"repeat-input\"><input id=\"repeatX\" name=\"repeat_x\" type=\"number\" min=\"1\" max=\"10000\" step=\"1\" value=\"1\"><span>layers</span></span>\n              </label>\n            </div>\n            <h3 class=\"section-subtitle\">Parameters</h3>\n            <div id=\"laserList\" class=\"laser-list\"></div>\n            <button id=\"addLaserBtn\" class=\"button dashed\" type=\"button\"><span>\uff0b</span> Add laser setting</button>\n            <div class=\"excel-import\">\n              <input id=\"excelFile\" type=\"file\" accept=\".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\" hidden>\n              <button id=\"importExcelBtn\" class=\"button ghost\" type=\"button\"><span aria-hidden=\"true\">\u21e7</span> Import from Excel</button>\n              <small id=\"excelStatus\"></small>\n            </div>\n            <p id=\"laserError\" class=\"section-error\" role=\"alert\"></p>\n          </div>\n        </details>\n\n        <details open class=\"form-section\">\n          <summary><span><b>03</b> Custom Fields</span><span class=\"section-count\" id=\"customCount\">0 fields</span><span class=\"chevron\">\u2303</span></summary>\n          <div class=\"section-body\">\n            <div id=\"customList\" class=\"custom-list\"></div>\n            <button id=\"addCustomBtn\" class=\"button dashed\" type=\"button\"><span>\uff0b</span> Add custom field</button>\n            <div id=\"fieldRecommendations\" class=\"field-recommendations\"></div>\n            <datalist id=\"customFieldNames\"></datalist>\n            <p id=\"customError\" class=\"section-error\" role=\"alert\"></p>\n          </div>\n        </details>\n      </fieldset></form>\n    </section>\n\n    <aside class=\"viewer-pane\" aria-label=\"Configuration viewer\">\n      <div class=\"tabs\" role=\"tablist\">\n        <button class=\"tab active\" role=\"tab\" aria-selected=\"true\" data-tab=\"preview\">Preview</button>\n        <button class=\"tab\" role=\"tab\" aria-selected=\"false\" data-tab=\"json\">JSON</button>\n        <button class=\"tab\" role=\"tab\" aria-selected=\"false\" data-tab=\"status\">Status</button>\n      </div>\n      <section id=\"statusPanel\" class=\"viewer-panel status-panel\" role=\"tabpanel\">\n        <h2 id=\"statusSummary\">Incomplete</h2>\n        <ul id=\"statusViolations\"></ul>\n        <label id=\"validationAckLabel\" class=\"validation-ack hidden\"><input id=\"validationAck\" type=\"checkbox\"> I have reviewed and accept the validation warnings.</label>\n      </section>\n      <section id=\"jsonPanel\" class=\"viewer-panel\" role=\"tabpanel\">\n        <div class=\"viewer-toolbar\"><span>config.json</span><button id=\"copyBtn\" type=\"button\">Copy</button></div>\n        <pre id=\"jsonOutput\" tabindex=\"0\" aria-label=\"Configuration JSON\" aria-live=\"polite\"></pre>\n      </section>\n      <section id=\"previewPanel\" class=\"viewer-panel active\" role=\"tabpanel\">\n        <div class=\"preview-head\"><div><span>LIGHTBURN RECREATION</span><strong id=\"previewTitle\">Select a template</strong></div><div class=\"zoom-control\"><button id=\"zoomOut\" aria-label=\"Zoom out\">\u2212</button><span id=\"zoomLabel\">100%</span><button id=\"zoomIn\" aria-label=\"Zoom in\">+</button></div></div>\n        <div id=\"previewStage\" class=\"preview-stage\"><div id=\"canvas\" class=\"canvas\"><div class=\"empty-preview\">Choose a template to see its flyer layout.</div></div></div>\n        <div class=\"legend\"><span id=\"flyerTotal\">0 flyers</span></div>\n      </section>\n    </aside>\n  </main>\n  <div id=\"toast\" class=\"toast\" role=\"status\"></div>\n  </div>";
            mount.append(container);
            this.cleanupBuilder = null;
            this.ready = this.startBuilder(mount, currentUser).catch(error => { container.textContent = error.message; });
            return this;
        },
        startBuilder: async function (mount, currentUser) {
            let activeConfig = null;
            let saved = [];
            const fetch = async (url, options = {}) => {
                if (url === '/api/cache') return {ok: true, json: async () => ({operators: [currentUser.get('login')], field_names: state.knownFieldNames})};
                let data;
                if (options.body instanceof FormData) {
                    const file = options.body.get('file');
                    if (file.size > 5 * 1024 * 1024) throw new Error('Workbook exceeds 5 MB.');
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    let binary = '';
                    for (const byte of bytes) binary += String.fromCharCode(byte);
                    data = {payload: JSON.stringify({filename: file.name, data: btoa(binary)})};
                }
                const result = await request(url.replace('/api/', ''), options.method || 'GET', data);
                return {ok: true, json: async () => result};
            };
            const $ = (selector, root = mount) => root.querySelector(selector);
const $$ = (selector, root = mount) => [...root.querySelectorAll(selector)];
const palette = ["#e6194b","#3c8d40","#4363d8","#e86818","#911eb4","#0075b5","#c51eb8","#24877f","#9a6324","#800000","#737300","#000075","#666666","#c9143c","#006400","#0000cd","#d83b00","#6a0dad","#007878","#a91270","#2f4f4f","#8b4513","#4b0082","#b22222","#228b22","#1674c5","#b85c16","#526574"];

const state = { materials: [], templates: [], templateDetail: null, laserParams: [], customFields: [], knownOperators: [], knownFieldNames: [], parameterImportFile: null, zoom: 1, submittedStackIds: [], presets: [], preset: null };
let draggedLaserId = null;

function makeLaser(values = {}) {
  const index = state.laserParams.length;
  const usedColors = new Set(state.laserParams.map(item => item.color.toLowerCase()));
  const nextColor = /^#[0-9a-f]{6}$/i.test(values.color || "") && !usedColors.has(values.color.toLowerCase()) ? values.color : palette.find(color => !usedColors.has(color.toLowerCase())) || palette[index];
  const laser = { id: crypto.randomUUID(), enabled: values.enabled !== false, name: `F${index + 1}`, color: nextColor, power: values.power ?? 60, speed: values.speed ?? 100, qpulsewidth: values.qpulsewidth ?? 200, frequency: values.frequency ?? 100, passes: values.passes ?? 1, fromImport: values.fromImport ?? false, locked: values.locked ?? false, importOriginal: values.importOriginal ?? null, isDefault: values.isDefault ?? values.is_default ?? false };
  if (laser.fromImport && !laser.importOriginal) laser.importOriginal = { power: Number(laser.power), speed: Number(laser.speed), qpulsewidth: Number(laser.qpulsewidth), frequency: Number(laser.frequency), passes: Number(laser.passes) };
  return laser;
}

function restoreImportedLaser(laser) {
  Object.assign(laser, laser.importOriginal);
  laser.enabled = true;
  laser.locked = true;
}

function normalizeLayerNames() {
  state.laserParams.forEach((laser, index) => { laser.name = `F${index + 1}`; });
}

function applyMaterialDefaults(material) {
  const preset = state.presets.find(entry => entry.id === state.preset);
  if (preset) { state.laserParams.filter(laser => laser.isDefault).forEach(laser => Object.assign(laser, preset.laser_defaults)); return; }
  if (!material?.laser_defaults) return;
  const defaults = material.laser_defaults;
  state.laserParams.filter(laser => laser.isDefault).forEach(laser => {
    laser.power = defaults.maxPower ?? laser.power;
    laser.speed = defaults.speed ?? laser.speed;
    laser.qpulsewidth = defaults.QPulseWidth ?? laser.qpulsewidth;
    laser.frequency = defaults.frequency ?? laser.frequency;
    laser.passes = defaults.numPasses ?? laser.passes;
  });
}

function moveLaser(sourceId, targetId, placeAfter = false) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const sourceIndex = state.laserParams.findIndex(laser => laser.id === sourceId);
  if (sourceIndex < 0) return;
  const [moved] = state.laserParams.splice(sourceIndex, 1);
  const targetIndex = state.laserParams.findIndex(laser => laser.id === targetId);
  state.laserParams.splice(targetIndex + (placeAfter ? 1 : 0), 0, moved);
  normalizeLayerNames();
  renderLasers();
  updateAll();
}

async function loadOptions() {
  try {
    const response = await fetch("/api/options");
    if (!response.ok) throw new Error("Could not load Girder catalog");
    const options = await response.json();
    state.materials = options.materials;
    state.templates = options.templates;
    state.presets = [];
    state.knownOperators = options.cache?.operators || [];
    state.knownFieldNames = options.cache?.field_names || [];
    renderAutocomplete();
    $("#operator").value = currentUser.get("login");
    fillSelect("#foilMaterial", state.materials, "Choose a foil material");
    fillSelect("#template", state.templates, "Choose a template");
  } catch (error) {
    toast(error.message);
    $("#foilMaterial").innerHTML = '<option value="">Backend unavailable</option>';
    $("#template").innerHTML = '<option value="">Backend unavailable</option>';
  }
  updateAll();
}

function fillSelect(selector, entries, placeholder) {
  const select = $(selector);
  select.innerHTML = `<option value="">${placeholder}</option>` + entries.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}${Number.isInteger(item.layer_count) ? ` · ${item.layer_count} layers` : ""}</option>`).join("");
}

function escapeHtml(value = "") { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }

function usedLaserCount(layerCount) {
  const repeat = Math.max(1, Number($("#repeatX").value) || 1);
  if (layerCount === null) return null;
  return Math.min(state.laserParams.length, Math.ceil(layerCount / repeat));
}

function renderAutocomplete() {
  $("#operatorNames").innerHTML = state.knownOperators.map(name => `<option value="${escapeHtml(name)}"></option>`).join("");
  $("#customFieldNames").innerHTML = state.knownFieldNames.map(name => `<option value="${escapeHtml(name)}"></option>`).join("");
  renderRecommendations();
}

function renderRecommendations() {
  const added = new Set(state.customFields.map(field => field.name.trim()).filter(Boolean));
  const suggestions = state.knownFieldNames.filter(name => !added.has(name)).slice(0, 3);
  $("#fieldRecommendations").innerHTML = suggestions.map(name => `<button type="button" class="recommend-field" data-field="${escapeHtml(name)}">＋ ${escapeHtml(name)}</button>`).join("");
}

function renderLasers() {
  const list = $("#laserList");
  const layerCount = state.templateDetail?.layers?.length ?? null;
  const usedCount = usedLaserCount(layerCount);
  list.innerHTML = state.laserParams.map((laser, index) => {
    const overflow = usedCount !== null && index >= usedCount;
    const unused = overflow || laser.enabled === false;
    return `
    <article class="laser-card ${unused ? "unused" : ""} ${laser.locked ? "import-locked" : ""}" data-id="${laser.id}">
      <div class="laser-head"><span class="drag-handle" draggable="true" aria-label="Drag ${laser.name} to reorder" title="Drag to reorder">⠿</span><i class="color-swatch" style="--swatch:${laser.color}"></i><span class="laser-name">Layer ${laser.name}</span>${laser.isDefault ? '<span class="default-badge">Default</span>' : ""}${laser.fromImport ? `<span class="source-badge ${laser.locked ? "" : "edited"}">${laser.locked ? "From Import" : "Edited from Import"}</span>` : ""}${unused ? '<span class="unused-badge">Unused</span>' : ""}${laser.fromImport ? `<button class="lock-btn toggle-lock" type="button" aria-label="${laser.locked ? "Unlock" : "Restore"} imported parameters">${laser.locked ? "Unlock" : "Restore"}</button>` : ""}<button class="remove-btn remove-laser" type="button" aria-label="Remove laser setting">×</button></div>
      <div class="laser-grid">
        <label>Layer<input data-key="name" value="${laser.name}" readonly aria-label="Locked layer name ${laser.name}"></label>
        <div class="color-field"><span>Color</span><div class="color-controls"><input class="wheel-editor" type="color" aria-label="${laser.name} color picker" value="${laser.color}" ${laser.locked ? "disabled" : ""}><input class="hex-editor" type="text" aria-label="${laser.name} hex color" value="${laser.color}" maxlength="7" placeholder="#RRGGBB" spellcheck="false" ${laser.locked ? "disabled" : ""}></div></div>
        <label class="checkbox-field layer-enabled ${overflow ? "overflow-enabled" : ""}" title="${overflow ? "Unused by template; enabled state is restored when this row fits" : ""}"><span>Enabled</span><span class="checkbox-control"><input data-key="enabled" type="checkbox" aria-label="Enable ${laser.name}" ${!overflow && laser.enabled !== false ? "checked" : ""} ${overflow || laser.locked ? "disabled" : ""}></span></label>
        <label>Power %<input data-key="power" type="number" min="0" max="100" step="0.1" value="${laser.power}" ${laser.locked ? "disabled" : ""}></label>
        <label>Speed mm/s<input data-key="speed" type="number" min="0.01" step="0.01" value="${laser.speed}" ${laser.locked ? "disabled" : ""}></label>
        <label>QPulse ns<input data-key="qpulsewidth" type="number" min="0" step="1" value="${laser.qpulsewidth}" ${laser.locked ? "disabled" : ""}></label>
        <label>Frequency kHz<input data-key="frequency" type="number" min="0" step="0.1" value="${laser.frequency}" ${laser.locked ? "disabled" : ""}></label>
        <label>Passes<input data-key="passes" type="number" min="1" step="1" value="${laser.passes}" ${laser.locked ? "disabled" : ""}></label>
      </div>
    </article>`;
  }).join("");
  $("#laserCount").textContent = `${state.laserParams.length} / ${layerCount ?? "—"}`;
  $("#addLaserBtn").disabled = state.laserParams.length >= 28;
  $("#addLaserBtn").classList.toggle("surplus", layerCount !== null && state.laserParams.length >= layerCount);
  $("#addLaserBtn").title = layerCount !== null && state.laserParams.length >= layerCount ? "Additional settings will be unused by this template" : "Add the next layer setting";
  $("#laserError").textContent = state.laserParams.length ? "" : "At least one laser setting is required.";
}

function presetFieldNames() { return Object.keys(state.presets.find(entry => entry.id === state.preset)?.custom_fields || {}); }

function renderCustomFields() {
  $("#customList").innerHTML = state.customFields.map(field => `
    <div class="custom-row" data-id="${field.id}"><label>Field name<input data-key="name" ${presetFieldNames().includes(field.name) ? "readonly" : ""} list="customFieldNames" autocomplete="off" value="${escapeHtml(field.name)}" placeholder="e.g. batch_code"></label><label>Value<input data-key="value" value="${escapeHtml(field.value)}" placeholder="Enter a value"></label><button class="remove-btn remove-custom ${presetFieldNames().includes(field.name) ? "hidden" : ""}" type="button" aria-label="Remove custom field">×</button></div>`).join("");
  $("#customCount").textContent = `${state.customFields.length} field${state.customFields.length === 1 ? "" : "s"}`;
  renderRecommendations();
}

function configObject() {
  const custom = {};
  state.customFields.forEach(({ name, value }) => { if (name.trim()) custom[name.trim()] = String(value).trim() ? value : null; });
  return {
    preset: state.preset,
    run_params: { stackid: $("#stackid").value.trim(), operator: $("#operator").value.trim() || state.knownOperators[0] || "", foil_material: $("#foilMaterial").value, template: $("#template").value },
    laser_assignment: { repeat: Number($("#repeatX").value), wraparound: $("#allowWraparound").checked },
    parameter_import_file: state.parameterImportFile,
    laser_params: state.laserParams.map(({ id, fromImport, importOriginal, locked, isDefault, ...laser }) => ({ name: laser.name, enabled: laser.enabled, is_default: isDefault, from_import: fromImport && locked, color: laser.color, power: Number(laser.power), speed: Number(laser.speed), qpulsewidth: Number(laser.qpulsewidth), frequency: Number(laser.frequency), passes: Number(laser.passes) })),
    custom_fields: custom
  };
}

function finalConfigObject() {
  const config = configObject();
  return {preset: config.preset, run_parameters: config.run_params,
    laser_parameters: {...config.laser_assignment, import_file: config.parameter_import_file, flyers: config.laser_params},
    custom_fields: config.custom_fields};
}

function updateAll() {
  $("#jsonOutput").textContent = JSON.stringify(finalConfigObject(), null, 2);
  validate(false);
  drawPreview();
}

function assessConfiguration({stackId, operator, lasers, fields, layers, repeat, wraparound, foilMaterial, template, duplicateStack = false, stackState = null, presetFields = []}) {
  const requirements = [
    {ok: Boolean(stackId.trim()), text: "Enter a Stack ID.", target: "#stackid"},
    {ok: lasers.some(laser => laser.enabled !== false), text: "Enable at least one laser parameter entry.", target: lasers.length ? '#laserList [data-key="enabled"]' : "#addLaserBtn"},
    {ok: fields.every(field => !String(field.value ?? "").trim() || field.name.trim()), text: "Name each custom field that has a value.", target: `.custom-row:nth-child(${fields.findIndex(field => String(field.value ?? "").trim() && !field.name.trim()) + 1}) [data-key="name"]`}
    ,{ok: Boolean(foilMaterial), text: "Select a foil material.", target: "#foilMaterial"}
    ,{ok: Boolean(template), text: "Select a template.", target: "#template"}
  ];
  if (presetFields.some(name => !fields.some(field => field.name === name))) requirements.push({ok:false,text:"Include all custom fields required by the preset.",target:"#customList"});
  const blockedMessage = {registered:'This Stack ID is registered and cannot be reused.', generated:'Delete the generated files before reusing this Stack ID.', restricted:'This Stack ID belongs to another user and cannot be replaced.'}[stackState];
  if (blockedMessage) requirements.push({ok:false, text:blockedMessage, target:'#stackid'});
  const warnings = [];
  const warningTargets = [];
  const warn = (message, target) => {warnings.push(message); warningTargets.push(target);};
  if (stackId.trim() && !/^(?:F\d{3,4}|[0-9A-HJKMNP-TV-Z]{5})$/.test(stackId.trim())) warn("Stack ID does not match F###, F####, or five-character Crockford Base32 format.", "#stackid");
  if (duplicateStack && !blockedMessage) warn("This Stack ID already has a submitted configuration. Validate replacing the existing submitted configuration.", "#stackid");
  if (!operator.trim()) warn("Operator is empty; your username will be used.", "#operator");
  if (lasers.some(laser => laser.enabled !== false && laser.isDefault)) warn("Some enabled layers still use default laser parameters.", `#laserList .laser-card:nth-child(${lasers.findIndex(laser => laser.enabled !== false && laser.isDefault) + 1}) [data-key="power"]`);
  const used = new Set();
  let uncovered = false;
  if (layers !== null) {
    for (let position = 0; position < layers.length; position++) {
      let index = Math.floor(position / Math.max(1, repeat || 1));
      if (wraparound && lasers.length) index %= lasers.length;
      if (index < lasers.length && lasers[index].enabled !== false) used.add(index);
      else uncovered = true;
    }
  }
  if (uncovered) warn("Some template flyers are unspecified; their template laser parameters will be retained.", "#repeatX");
  if (lasers.some((laser, index) => laser.enabled === false || (layers !== null && !used.has(index)))) warn("Some listed laser entries are disabled or unused by the template.", `#laserList .laser-card:nth-child(${lasers.findIndex((laser, index) => laser.enabled === false || (layers !== null && !used.has(index))) + 1}) [data-key="enabled"]`);
  if (fields.some(field => field.name.trim() && !String(field.value ?? "").trim())) warn("Some custom fields have no value; they will export as null.", `.custom-row:nth-child(${fields.findIndex(field => field.name.trim() && !String(field.value ?? "").trim()) + 1}) [data-key="value"]`);
  const complete = requirements.every(requirement => requirement.ok);
  return {requirements, warnings, violations: [...requirements.filter(item => !item.ok).map(item => ({...item, kind:"Required"})), ...warnings.map((text, index) => ({text, target:warningTargets[index], kind:"Validation"}))], status: !complete ? "Incomplete" : warnings.length ? "Needs validation" : "Complete", complete};
}

function configurationStatus() {
  return assessConfiguration({presetFields: presetFieldNames(), stackState: state.stackStates?.[$("#stackid").value.trim().toUpperCase()], duplicateStack: (state.submittedStackIds || []).includes($("#stackid").value.trim()), foilMaterial: $("#foilMaterial").value, template: $("#template").value, stackId: $("#stackid").value, operator: $("#operator").value,
    lasers: state.laserParams, fields: state.customFields, layers: state.templateDetail?.layers ?? null,
    repeat: Number($("#repeatX").value), wraparound: $("#allowWraparound").checked});
}

let acknowledgedSnapshot = null;
function validationSnapshot() {
  return JSON.stringify({config: configObject(), operator: $('#operator').value,
    lasers: state.laserParams, fields: state.customFields, warnings: configurationStatus().warnings});
}
function clearValidation() {
  acknowledgedSnapshot = null;
  $('#validationAck').checked = false;
}
$('#validationAck').addEventListener('change', () => {
  acknowledgedSnapshot = $('#validationAck').checked ? validationSnapshot() : null;
  validate(false);
});
for (const eventName of ['input', 'change', 'reset']) $('#configForm').addEventListener(eventName, clearValidation, true);

function validate(showErrors = true) {
  const result = configurationStatus();
  if (acknowledgedSnapshot !== validationSnapshot()) clearValidation();
  $('#validationAck').disabled = !result.complete || Boolean($('#configFields')?.disabled);
  const statusText = state.viewStatus || (result.complete && result.warnings.length && $('#validationAck').checked ? 'Validated' : result.status);
  $('#validationAckLabel').classList.toggle('hidden', statusText !== 'Needs validation');
  $("#saveState").innerHTML = `<span></span> ${statusText}`;
  $("#saveState").dataset.status = statusText.toLowerCase().replaceAll(" ", "-");
  $("#statusSummary").textContent = statusText;
  $("#statusViolations").innerHTML = (state.viewStatus ? [] : result.violations).map((item, index) => `<li><button type="button" class="violation-link" data-violation="${index}"><span class="violation-kind">${item.kind}</span>${escapeHtml(item.text)}<span aria-hidden="true"> ↗</span></button></li>`).join("");
  $("#stackid").classList.toggle("invalid", showErrors && !result.requirements[0].ok);
  $("#stackidError").textContent = showErrors && !result.requirements[0].ok ? "Stack ID is required." : "";
  $("#runRequiredMarker").classList.toggle("hidden", result.requirements[0].ok && result.requirements[3].ok && result.requirements[4].ok);
  $("#laserError").textContent = showErrors && !result.requirements[1].ok ? "Enable at least one laser parameter entry." : "";
  $("#customError").textContent = showErrors && !result.requirements[2].ok ? "Custom fields with values need names." : "";
  $$(".custom-row").forEach(row => {
    const field = state.customFields.find(item => item.id === row.dataset.id);
    $("[data-key='name']", row).classList.toggle("invalid", showErrors && Boolean(String(field.value).trim()) && !field.name.trim());
    $("[data-key='value']", row).classList.remove("invalid");
  });
  return result.complete;
}

function confirmExport() {
  validate(true);
  const result = configurationStatus();
  if (!result.complete) {
    $('[data-tab="status"]').click();
    toast("Complete the requirements shown in Status before exporting.");
    return false;
  }
  if (result.warnings.length && !$('#validationAck').checked) {
    $('[data-tab="status"]').click();
    $('#validationAckLabel').scrollIntoView({block:'center', behavior:'smooth'});
    $('#validationAck').focus({preventScroll:true});
    toast('Review the warnings and check the validation box in Status before submitting.');
    return false;
  }
  return true;
}

async function changeTemplate() {
  const id = $("#template").value;
  const entry = state.templates.find(item => item.id === id);
  $("#templateMeta").textContent = entry ? `${entry.layer_count} unique layers · ${entry.flyer_count} physical flyers` : "";
  state.templateDetail = null;
  if (id) {
    const response = await fetch(`/api/templates/${encodeURIComponent(id)}`);
    if (response.ok) state.templateDetail = await response.json();
  }
  renderLasers();
  updateAll();
}

function resolveLaserForLayer(layerIndex) {
  const total = state.laserParams.length;
  if (!total) return { laser: null, augmented: false };
  const repeat = Math.max(1, Number($("#repeatX").value) || 1);
  let laserIndex = Math.floor(layerIndex / repeat);
  if ($("#allowWraparound").checked) laserIndex %= total;
  const setting = state.laserParams[laserIndex];
  const laser = setting?.enabled !== false ? setting || null : null;
  return { laser, augmented: Boolean(laser && laser.name !== `F${layerIndex + 1}`) };
}

function updateAssignmentUI() {
  renderLasers(); updateAll();
}

function drawPreview() {
  const canvas = $("#canvas"); const flyers = state.templateDetail?.flyers || [];
  const templateLayers = state.templateDetail?.layers || [];
  const material = state.materials.find(item => item.id === $("#foilMaterial").value);
  const materialStyle = material?.color ? `--material:${escapeHtml(material.color)};` : "";
  $("#flyerTotal").textContent = `${templateLayers.length} layers · ${flyers.length} flyers`;
  $("#previewTitle").textContent = state.templateDetail?.label || state.templateDetail?.id || "Select a template";
  canvas.style.transform = `scale(${state.zoom})`;
  $("#zoomLabel").textContent = `${Math.round(state.zoom * 100)}%`;
  if (!flyers.length) { canvas.innerHTML = '<div class="empty-preview">Choose a template to see its flyer layout.</div>'; return; }
  const xs = flyers.map(f => Number(f.xpos)), ys = flyers.map(f => Number(f.ypos));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX-minX,1), spanY = Math.max(maxY-minY,1); const size = Math.max(18, Math.min(42, 210 / Math.sqrt(flyers.length)));
  canvas.innerHTML = flyers.map(flyer => { const layerIndex = templateLayers.indexOf(String(flyer.layer)); const { laser, augmented } = resolveLaserForLayer(layerIndex); const color = laser?.color || "#909995"; const left = 8 + ((Number(flyer.xpos)-minX)/spanX)*84; const top = 8 + ((maxY-Number(flyer.ypos))/spanY)*84; const mapping = laser ? `Template ${flyer.layer} uses ${laser.name}${augmented ? " (augmented)" : ""}` : `Template ${flyer.layer} is unchanged`; return `<div class="flyer ${laser ? "" : "unconfigured"}" title="${escapeHtml(flyer.position)} · ${escapeHtml(mapping)}" style="--layer:${color};${materialStyle}left:calc(${left}% - ${size/2}px);top:calc(${top}% - ${size/2}px);width:${size}px;height:${size}px">${laser ? escapeHtml(laser.name) + (augmented ? "*" : "") : escapeHtml(flyer.layer)}</div>`; }).join("");
}

async function importExcel(file) {
  if (!file) return;
  const status = $("#excelStatus");
  status.textContent = `Importing ${file.name}…`;
  const body = new FormData(); body.append("file", file);
  try {
    const response = await fetch("/api/import-laser-params", { method: "POST", body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not import the workbook.");
    state.laserParams = [];
    state.parameterImportFile = result.reference || result.filename;
    result.laser_params.forEach(values => state.laserParams.push(makeLaser({ ...values, fromImport: true, locked: true })));
    normalizeLayerNames(); renderLasers(); updateAll();
    status.textContent = `Imported ${state.laserParams.length} layers from ${result.filename}.`;
    toast(`Imported ${state.laserParams.length} laser settings`);
  } catch (error) {
    status.textContent = error.message; toast("Excel import failed");
  } finally { $("#excelFile").value = ""; }
}

async function persistCache() {
  const response = await fetch("/api/cache", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operator: $("#operator").value.trim() || state.knownOperators[0] || "", field_names: state.customFields.map(field => field.name.trim()).filter(Boolean) }) });
  if (!response.ok) return;
  const cache = await response.json(); state.knownOperators = cache.operators || []; state.knownFieldNames = cache.field_names || []; renderAutocomplete();
}

async function importJson(file, savedSnapshot = false) {
  if (!file) return;
  try {
    let cfg = JSON.parse(await file.text());
    if (cfg.run_parameters) cfg = {preset:cfg.preset, run_params:cfg.run_parameters, laser_assignment:cfg.laser_parameters,
      parameter_import_file:cfg.laser_parameters?.import_file, laser_params:cfg.laser_parameters?.flyers,
      custom_fields:cfg.custom_fields};
    state.preset = null;
    $("#stackid").value = cfg.run_params?.stackid ?? "";
    $("#operator").value = cfg.run_params?.operator ?? "";
    $("#foilMaterial").value = state.materials.find(material => material.id === cfg.run_params?.foil_material || material.legacyId === cfg.run_params?.foil_material)?.id ?? cfg.run_params?.foil_material ?? "";
    $("#template").value = cfg.run_params?.template ?? "";
    const assignment = cfg.laser_assignment || {};
    $("#repeatX").value = assignment.repeat ?? (assignment.style === "repeat" ? assignment.x || 1 : 1);
    $("#allowWraparound").checked = assignment.wraparound ?? assignment.style !== "exact";
    state.parameterImportFile = savedSnapshot ? cfg.parameter_import_file ?? null : file.name;
    state.laserParams = [];
    (Array.isArray(cfg.laser_params) ? cfg.laser_params : []).slice(0, 28).forEach(values => state.laserParams.push(makeLaser({ ...values, fromImport: savedSnapshot ? Boolean(values.from_import) : true, locked: savedSnapshot ? Boolean(values.from_import) : true })));
    if (!state.laserParams.length && !savedSnapshot) state.laserParams.push(makeLaser({ isDefault: true }));
    state.customFields = (cfg.custom_field_rows || Object.entries(cfg.custom_fields || {}).map(([name,value]) => ({name,value}))).map(({name,value}) => ({id:crypto.randomUUID(),name,value:String(value ?? "")}));
    await changeTemplate(); updateAssignmentUI(); renderCustomFields(); updateAll();
    toast(`Imported ${file.name}`);
  } catch (error) { toast(`JSON import failed: ${error.message}`); }
  finally { $("#jsonFile").value = ""; }
}

function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 1800); }

$("#configForm").addEventListener("input", event => { if (event.target.closest(".laser-card")) { const card = event.target.closest(".laser-card"); const laser = state.laserParams.find(item => item.id === card.dataset.id); if (event.target.classList.contains("hex-editor") || event.target.classList.contains("wheel-editor")) return; laser[event.target.dataset.key] = event.target.dataset.key === "enabled" ? event.target.checked : event.target.value; if (event.target.dataset.key === "enabled") { renderLasers(); updateAll(); return; } if (event.target.dataset.key !== "name" && laser.isDefault) { laser.isDefault = false; card.querySelector(".default-badge")?.remove(); } } else if (event.target.closest(".custom-row")) { const row = event.target.closest(".custom-row"); state.customFields.find(item => item.id === row.dataset.id)[event.target.dataset.key] = event.target.value; renderRecommendations(); } updateAll(); });
$("#configForm").addEventListener("click", event => { const laserBtn = event.target.closest(".remove-laser"); const lockBtn = event.target.closest(".toggle-lock"); const customBtn = event.target.closest(".remove-custom"); const recommendation = event.target.closest(".recommend-field"); if (recommendation) { state.customFields.push({ id: crypto.randomUUID(), name: recommendation.dataset.field, value: "" }); renderCustomFields(); updateAll(); return; } if (lockBtn) { const laser = state.laserParams.find(item => item.id === lockBtn.closest(".laser-card").dataset.id); if (laser.locked) laser.locked = false; else { restoreImportedLaser(laser); } renderLasers(); updateAll(); return; } if (laserBtn) { if (state.laserParams.length === 1) { toast("At least one laser setting is required."); return; } state.laserParams = state.laserParams.filter(item => item.id !== laserBtn.closest(".laser-card").dataset.id); normalizeLayerNames(); renderLasers(); updateAll(); } if (customBtn) { const target = state.customFields.find(item => item.id === customBtn.closest(".custom-row").dataset.id); if (presetFieldNames().includes(target?.name)) return; state.customFields = state.customFields.filter(item => item.id !== target.id); renderCustomFields(); updateAll(); } });
$("#laserList").addEventListener("dragstart", event => { const handle = event.target.closest(".drag-handle"); if (!handle) { event.preventDefault(); return; } const card = handle.closest(".laser-card"); draggedLaserId = card.dataset.id; card.classList.add("dragging"); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", draggedLaserId); });
$("#laserList").addEventListener("dragover", event => { const card = event.target.closest(".laser-card"); if (!card || card.dataset.id === draggedLaserId) return; event.preventDefault(); $$(".laser-card.drag-over").forEach(item => item.classList.remove("drag-over")); card.classList.add("drag-over"); event.dataTransfer.dropEffect = "move"; });
$("#laserList").addEventListener("dragleave", event => { const card = event.target.closest(".laser-card"); if (card && !card.contains(event.relatedTarget)) card.classList.remove("drag-over"); });
$("#laserList").addEventListener("drop", event => { const card = event.target.closest(".laser-card"); if (!card) return; event.preventDefault(); const bounds = card.getBoundingClientRect(); moveLaser(draggedLaserId, card.dataset.id, event.clientY > bounds.top + bounds.height / 2); draggedLaserId = null; });
$("#laserList").addEventListener("dragend", () => { draggedLaserId = null; $$(".laser-card.dragging,.laser-card.drag-over").forEach(card => card.classList.remove("dragging", "drag-over")); });
$("#foilMaterial").addEventListener("change", () => { const material = state.materials.find(item => item.id === $("#foilMaterial").value); $("#materialMeta").textContent = material ? [material.name, material.thickness_um && `${material.thickness_um} µm`, material.igsn].filter(Boolean).join(" · ") : "Foil IGSNs from Girder"; applyMaterialDefaults(material); renderLasers(); updateAll(); });
$("#template").addEventListener("change", changeTemplate);
$("#allowWraparound").addEventListener("change", updateAssignmentUI);
$("#repeatX").addEventListener("input", updateAssignmentUI);
$("#addLaserBtn").addEventListener("click", () => { if (state.laserParams.length >= 28) return; state.laserParams.push(makeLaser({ isDefault: true })); applyMaterialDefaults(state.materials.find(item => item.id === $("#foilMaterial").value)); renderLasers(); updateAll(); });
$("#importExcelBtn").addEventListener("click", () => $("#excelFile").click());
$("#excelFile").addEventListener("change", event => importExcel(event.target.files?.[0]));

$("#jsonFile").addEventListener("change", event => importJson(event.target.files?.[0]));
$("#addCustomBtn").addEventListener("click", () => { state.customFields.push({id:crypto.randomUUID(),name:"",value:""}); renderCustomFields(); updateAll(); });
$('#saveState').addEventListener('click', () => { $('[data-tab="status"]').click(); $('#statusPanel').scrollIntoView({block:'nearest',behavior:'smooth'}); });
$$('.tab').forEach(tab => tab.addEventListener("click", () => { $$('.tab').forEach(t => { t.classList.toggle("active", t === tab); t.setAttribute("aria-selected", t === tab); }); $$('.viewer-panel').forEach(panel => panel.classList.toggle("active", panel.id === `${tab.dataset.tab}Panel`)); }));
$("#copyBtn").addEventListener("click", async () => { if (!confirmExport()) return; await navigator.clipboard.writeText(JSON.stringify(finalConfigObject(),null,2)); toast("JSON copied to clipboard"); });
$("#zoomIn").addEventListener("click", () => { state.zoom=Math.min(1.5,state.zoom+.1); drawPreview(); }); $("#zoomOut").addEventListener("click", () => { state.zoom=Math.max(.6,state.zoom-.1); drawPreview(); });

state.laserParams.push(makeLaser({ isDefault: true })); updateAssignmentUI(); renderCustomFields(); await loadOptions();

$("#statusViolations").addEventListener("click", event => {
  const button = event.target.closest('[data-violation]');
  if (!button) return;
  const issue = configurationStatus().violations[Number(button.dataset.violation)];
  const field = issue && $(issue.target);
  if (!field) return;
  const section = field.closest('details');
  if (section) section.open = true;
  const destination = field.disabled ? field.closest('.laser-card') || field : field;
  if (destination === field && field.disabled) destination.setAttribute('tabindex', '-1');
  if (destination !== field) destination.setAttribute('tabindex', '-1');
  destination.scrollIntoView({behavior:'smooth', block:'center'});
  destination.focus({preventScroll:true});
  destination.classList.add('violation-focus');
  setTimeout(() => destination.classList.remove('violation-focus'), 1800);
});

// Render help at the root so cards and scrolling panels cannot clip it.
const tooltipRoot = $('#configForm').getRootNode();
const tooltip = document.createElement('div');
tooltip.className = 'floating-help hidden';
tooltip.setAttribute('role', 'tooltip');
tooltip.id = 'flycut-help-tooltip';
(tooltipRoot === document ? document.body : tooltipRoot).append(tooltip);
let activeHelp = null;
const hideHelp = () => { tooltip.classList.add('hidden'); activeHelp?.removeAttribute('aria-describedby'); activeHelp = null; };
const showHelp = event => {
  const button = event.target.closest?.('.help[data-tip]');
  if (!button) return;
  activeHelp = button;
  tooltip.textContent = button.dataset.tip;
  button.setAttribute('aria-describedby', tooltip.id);
  tooltip.classList.remove('hidden');
  const rect = button.getBoundingClientRect();
  const box = tooltip.getBoundingClientRect();
  tooltip.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - box.width - 10)) + 'px';
  tooltip.style.top = (rect.top >= box.height + 14 ? rect.top - box.height - 8 : rect.bottom + 8) + 'px';
};
const dismissHelp = event => { if (event.target.closest?.('.help')) hideHelp(); };
tooltipRoot.addEventListener('pointerover', showHelp);
tooltipRoot.addEventListener('focusin', showHelp);
tooltipRoot.addEventListener('pointerout', dismissHelp);
tooltipRoot.addEventListener('focusout', dismissHelp);
window.addEventListener('scroll', hideHelp, true);
window.addEventListener('resize', hideHelp);
function cleanupTooltips() {
  tooltipRoot.removeEventListener('pointerover', showHelp);
  tooltipRoot.removeEventListener('focusin', showHelp);
  tooltipRoot.removeEventListener('pointerout', dismissHelp);
  tooltipRoot.removeEventListener('focusout', dismissHelp);
  window.removeEventListener('scroll', hideHelp, true);
  window.removeEventListener('resize', hideHelp);
  tooltip.remove();
}

function commitHexColor(input) {
  const laser = state.laserParams.find(item => item.id === input.closest('.laser-card').dataset.id);
  const value = input.value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(value) || state.laserParams.some(item => item.id !== laser.id && item.color.toLowerCase() === value.toLowerCase())) {
    input.value = laser.color;
    toast('Use a unique six-digit hex color, such as #3C8D40.');
    return;
  }
  laser.color = value.toUpperCase();
  renderLasers(); updateAll();
}
$('#laserList').addEventListener('change', event => {
  if (event.target.classList.contains('hex-editor') || event.target.classList.contains('wheel-editor')) commitHexColor(event.target);
});
$('#laserList').addEventListener('keydown', event => {
  if (!event.target.classList.contains('hex-editor')) return;
  if (event.key === 'Enter') { event.preventDefault(); commitHexColor(event.target); }
  if (event.key === 'Escape') {
    const card = event.target.closest('.laser-card');
    event.target.value = state.laserParams.find(item => item.id === card.dataset.id).color;
    card.querySelector('.wheel-editor').focus();
  }
});

            let busy = false;
            let completeWorkflow = false;
            let readOnly = false;
            let baseline = '';
            const snapshot = () => JSON.stringify({config:configObject(), operator:$('#operator').value,
                fields:state.customFields, lasers:state.laserParams, name:$('#saveAsName').value});
            const dirty = () => !readOnly && !$('#builderScreen').classList.contains('hidden') && snapshot() !== baseline;
            const canLeave = () => !dirty() || confirm('You have unsaved changes. Leave without saving? Choose Cancel to return and save.');
            const status = message => { $('#runStatus').textContent = message; };
            const showScreen = id => {
                for (const screen of ['workflowHome', 'configurationPicker', 'lightburnPicker', 'registrationPicker', 'builderScreen', 'adminSettingsScreen'])
                    $('#' + screen).classList.toggle('hidden', screen !== id);
                $('#currentPageLabel').textContent = {workflowHome:'Home', configurationPicker:'Configuration', lightburnPicker:'Generation', registrationPicker:'Registration', builderScreen:readOnly ? 'View configuration' : 'Configure flyer stack'}[id];
                $('#builderActions').classList.toggle('hidden', id !== 'builderScreen');
                status('');
            };
            const home = () => { completeWorkflow = false; showScreen('workflowHome'); renderHome(); };
            const configure = async automated => {
                completeWorkflow = automated;
                if (automated && activeConfig && (activeConfig.status !== 'draft' || activeConfig.canEdit === false)) activeConfig = null;
                $('#configurationPickerTitle').textContent = automated ? 'Complete Workflow' : 'Configuration';
                $('#completeWorkflowHint').classList.toggle('hidden', !automated);
                $('#submitConfigBtn').textContent = automated ? 'Submit, generate & register' : 'Submit';
                await refresh();
                showScreen('configurationPicker');
            };
            const savedTime = record => record?.savedAt ? new Date(record.savedAt).toLocaleString() : '';
            const selectableConfigs = records => completeWorkflow ? records.filter(record => record.status === 'draft' && record.canEdit !== false) : records;
            const renderHome = () => {
                $('#buildConfigBtn').textContent = activeConfig ? (activeConfig.status === 'draft' ? 'Edit config' : 'View config') : 'Build config';
                $('#buildConfigBtn').disabled = busy;
                $('#presetPicker').classList.add('hidden');
                $('#presetSelect').disabled = true;
                $('#savedConfigs').disabled = busy;
                $('#submittedConfigs').disabled = busy;
                $('#configurationStepBtn').disabled = busy;
                $('#completeWorkflowBtn').disabled = busy;
                $('#lightburnStepBtn').disabled = busy;
                $('#registerBtn').disabled = busy;
                const generation = saved.find(record => record._id === $('#submittedConfigs').value);
                $('#generateBtn').disabled = busy || !generation || generation.status !== 'submitted' || generation.canEdit === false;
                $('#deleteFilesBtn').classList.toggle('hidden', generation?.status !== 'generated');
                $('#deleteFilesBtn').disabled = busy || generation?.canEdit === false;
                $('#generatedFolderLink').classList.toggle('hidden', !generation?.folderId || !['generated','registered'].includes(generation?.status));
                $('#generatedFolderLink').href = generation?.folderId ? '#folder/' + generation.folderId : '#';
                $('#filesHint').textContent = generation ? 'Status: ' + generation.status : '';
                const registration = saved.find(record => record._id === $('#registrationConfigs').value);
                $('#registrationConfigs').disabled = busy;
                $('#registerStackBtn').disabled = busy || registration?.status !== 'generated' || registration?.canEdit === false;
                $('#registrationHint').textContent = registration?.status === 'registered' ? 'Registered · ' + (registration.registration?.igsn || '') : '';
                const igsn = registration?.status === 'registered' && !registration.registration?.mock ? registration.registration?.igsn : null;
                $('#viewIgsnLink').classList.toggle('hidden', !igsn);
                $('#viewIgsnLink').href = igsn ? '#igsn/' + encodeURIComponent(igsn) : '#';
                $('#artifacts').replaceChildren();
            };
            const refresh = async () => {
                [saved, state.submittedStackIds, state.stackStates] = await Promise.all([request('config'), request('submitted-stacks'), request('stack-states')]);
                const option = record => `<option value="${escapeHtml(record._id)}">${escapeHtml(record.name)} · ${escapeHtml(savedTime(record))} · ${escapeHtml(record.status)}</option>`;
                const groupedOptions = (records, disableRegistered = false) => ['draft', 'submitted', 'generated', 'registered'].map(stage => {
                    const entries = records.filter(record => record.status === stage).sort((a, b) => (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0) || String(a._id).localeCompare(String(b._id)));
                    return entries.length ? `<optgroup ${disableRegistered && stage === 'registered' ? 'disabled' : ''} label="${stage[0].toUpperCase() + stage.slice(1)}">${entries.map(option).join('')}</optgroup>` : '';
                }).join('');
                const submitted = saved.filter(record => ['submitted', 'generated'].includes(record.status));
                const configurations = selectableConfigs(saved);
                $('#savedConfigs').innerHTML = '<option value="">New configuration</option>' + groupedOptions(configurations);
                const selectedSubmission = $('#submittedConfigs').value;
                $('#submittedConfigs').innerHTML = '<option value="">' + (submitted.length ? 'Choose a submitted configuration' : 'No submitted configurations') + '</option>' + groupedOptions(submitted, true);
                if (submitted.some(record => record._id === selectedSubmission && record.status !== 'registered')) $('#submittedConfigs').value = selectedSubmission;
                const selectedRegistration = $('#registrationConfigs').value;
                const generated = saved.filter(record => ['generated','registered'].includes(record.status));
                $('#registrationConfigs').innerHTML = '<option value="">' + (generated.length ? 'Choose a generated configuration' : 'No generated configurations') + '</option>' + groupedOptions(generated);
                if (generated.some(record => record._id === selectedRegistration)) $('#registrationConfigs').value = selectedRegistration;
                if (activeConfig) {
                    activeConfig = saved.find(record => record._id === activeConfig._id) || activeConfig;
                    $('#savedConfigs').value = configurations.some(record => record._id === activeConfig._id) ? activeConfig._id : '';
                }
                renderHome();
            };
            const setReadOnly = value => {
                readOnly = value;
                state.viewStatus = value ? activeConfig.status[0].toUpperCase() + activeConfig.status.slice(1) : null;
                $('#stackid').readOnly = false;
                $('#autoStackIdBtn').setAttribute('aria-pressed', 'false');
                clearValidation();
                $('#configFields').disabled = value;
                $('#saveAsName').disabled = value;
                $('#builderScreen').classList.toggle('read-only', value);
                for (const id of ['#saveGirderBtn', '#submitConfigBtn', '#resetBtn']) $(id).classList.toggle('hidden', value);
                $('#editCopyBtn').classList.toggle('hidden', !value);
                $('.intro h1').textContent = 'Configure Flyer Stack';
                $('#builderMode').textContent = value ? 'Read-only' : activeConfig?.savedAt ? `Saved ${savedTime(activeConfig)}` : '';
                updateAll();
            };
            const blank = () => {
                $('#configForm').reset();
                $('#operator').value = currentUser.get('login');
                state.laserParams = [];
                state.laserParams.push(makeLaser({isDefault: true}));
                state.preset = null;
                const preset = state.presets.find(entry => entry.id === state.preset);
                if (preset) Object.assign(state.laserParams[0], preset.laser_defaults);
                state.customFields = Object.entries(preset?.custom_fields || {}).map(([name,value]) => ({id:crypto.randomUUID(),name,value:String(value ?? '')}));
                state.templateDetail = null;
                state.parameterImportFile = null;
                state.zoom = 1;
                updateAssignmentUI(); renderCustomFields(); updateAll();
            };
            // A disabled fieldset blocks inputs; explicitly block HTML drag/reorder as well.
            for (const eventName of ['dragstart', 'drop', 'keydown']) {
                $('#configForm').addEventListener(eventName, event => {
                    if (readOnly) { event.preventDefault(); event.stopImmediatePropagation(); }
                }, true);
            }
            const act = (id, fn) => $(id).addEventListener('click', async () => {
                if (busy) return;
                busy = true;
                $('#saveGirderBtn').disabled = true;
                $('#submitConfigBtn').disabled = true;
                $('#backWorkflowBtn').disabled = true;
                $('#resetBtn').disabled = true;
                renderHome();
                try { await fn(); }
                catch (error) { status(error.message); toast(error.message); }
                finally {
                    busy = false;
                    $('#saveGirderBtn').disabled = false;
                    $('#submitConfigBtn').disabled = false;
                    $('#backWorkflowBtn').disabled = false;
                    $('#resetBtn').disabled = false;
                    renderHome();
                }
            });
            const addPortalTemplate = detail => {
                if (!state.templates.some(entry => entry.id === detail.id)) {
                    state.templates.push(detail);
                    const option = document.createElement('option');
                    option.value = detail.id;
                    option.textContent = detail.label + ' · Portal';
                    $('#template').append(option);
                }
            };
            act('#browseTemplateBtn', async () => {
                if (readOnly) return;
                const options = await request('options');
                if (!options.workspaceFolderId) throw new Error('Configure a Flyer Studio workspace first.');
                const workspaceRoot = new girder.models.FolderModel({_id: options.workspaceFolderId});
                await workspaceRoot.fetch();
                let selected;
                const picker = new girder.views.widgets.BrowserWidget({
                    parentView: this, root: workspaceRoot, showItems: true, selectItem: true,
                    titleText: 'Choose a portal template', submitText: 'Use template',
                    validate: async model => {
                        if (!model || !model.get('folderId')) throw 'Choose an item containing a LightBurn template.';
                        try {
                            selected = await request('template-item/' + model.id, 'GET', {});
                        } catch (error) { throw error.message; }
                    }
                });
                this.listenTo(picker, 'g:saved', async () => {
                    addPortalTemplate(selected);
                    $('#template').value = selected.id;
                    try { await changeTemplate(); } catch (error) { toast(error.message); }
                });
                picker.setElement(document.querySelector('#g-dialog-container')).render();
                const uploadLink = document.createElement('a');
                uploadLink.textContent = 'Open this location to upload a template ↗';
                uploadLink.target = '_blank';
                uploadLink.rel = 'noopener';
                uploadLink.href = '#folder/' + workspaceRoot.id;
                uploadLink.style.cssText = 'display:block;margin:12px 0';
                uploadLink.addEventListener('click', () => {
                    const location = picker._hierarchyView.parentModel;
                    uploadLink.href = '#' + location.resourceName + '/' + location.id;
                });
                picker.$('.g-hierarchy-widget-container').after(uploadLink);

            });
            act('#autoStackIdBtn', async () => {
                if (readOnly) return;
                if ($('#stackid').readOnly) {
                    $('#stackid').readOnly = false;
                    $('#autoStackIdBtn').setAttribute('aria-pressed', 'false');
                    $('#autoStackIdBtn').title = 'Assign lowest available Stack ID';
                    $('#stackid').focus();
                } else {
                    const result = await request('next-stack-id');
                    $('#stackid').value = result.stackid;
                    $('#stackid').readOnly = true;
                    $('#autoStackIdBtn').setAttribute('aria-pressed', 'true');
                    $('#autoStackIdBtn').title = 'Unlock Stack ID';
                }
                clearValidation(); updateAll();
            });
            $('#configForm').addEventListener('reset', () => {
                $('#stackid').readOnly = false;
                $('#autoStackIdBtn').setAttribute('aria-pressed', 'false');
            });
            let adminPolicy = null;
            let principalResults = [];
            const policyBooleans = ['creators_include_user', 'owners_include_user', 'editors_include_user', 'viewers_include_user', 'public_igsn', 'public_files'];
            const renderPolicyLists = () => {
                $('#policyLists').innerHTML = ['creators', 'owners', 'editors', 'viewers'].map(role => `<h3>${role[0].toUpperCase() + role.slice(1)}</h3><ul>${adminPolicy[role].map((ref, index) => `<li>${escapeHtml(ref.label || ref.id)} (${ref.type}) <button type="button" class="button ghost" data-role="${role}" data-index="${index}">Remove</button></li>`).join('') || '<li>None</li>'}</ul>`).join('');
            };
            $('#adminSettingsBtn').classList.add('hidden');
            $('#adminSettingsBack').addEventListener('click', home);
            $('#workspacePath').addEventListener('input', () => { if (adminPolicy) adminPolicy.workspace_folder_id = ''; });
            $('#policyLists').addEventListener('click', event => {
                const button = event.target.closest('button[data-role]');
                if (!button) return;
                adminPolicy[button.dataset.role].splice(Number(button.dataset.index), 1);
                renderPolicyLists();
            });
            const searchPrincipals = async () => {
                principalResults = await request('settings/principals', 'GET', {q: $('#principalSearch').value});
                $('#principalResults').innerHTML = principalResults.map((ref, index) => `<option value="${index}">${escapeHtml(ref.label)} (${ref.type})</option>`).join('');
            };
            act('#adminSettingsBtn', async () => {
                const result = await request('settings');
                adminPolicy = result.settings;
                $('#workspacePath').value = adminPolicy.workspace_path;
                $('#workspaceCollection').innerHTML = result.collections.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
                if (result.workspaceCollectionId) $('#workspaceCollection').value = result.workspaceCollectionId;
                policyBooleans.forEach(key => { $('#' + key).checked = adminPolicy[key]; });
                renderPolicyLists();
                await searchPrincipals();
                $('#settingsStatus').textContent = '';
                showScreen('adminSettingsScreen');
            });
            act('#findPrincipalsBtn', searchPrincipals);
            act('#addPrincipalBtn', async () => {
                const ref = principalResults[Number($('#principalResults').value)];
                if (!ref) return;
                const role = $('#principalRole').value;
                if (!adminPolicy[role].some(entry => entry.id === ref.id && entry.type === ref.type)) adminPolicy[role].push(ref);
                renderPolicyLists();
            });
            act('#browseWorkspaceBtn', async () => {
                const id = $('#workspaceCollection').value;
                if (!id) throw new Error('Create a collection and workspace folder in Girder first.');
                const root = new girder.models.CollectionModel({_id: id});
                await root.fetch();
                let selected;
                const picker = new girder.views.widgets.BrowserWidget({parentView:this, root, showItems:false,
                    titleText:'Choose a workspace folder', submitText:'Use folder',
                    validate: async model => {
                        if (model?.resourceName !== 'folder') throw 'Choose a folder inside the collection.';
                        selected = await request('settings/workspace', 'GET', {id:model.id});
                    }});
                this.listenTo(picker, 'g:saved', () => {
                    adminPolicy.workspace_folder_id = selected.id;
                    $('#workspacePath').value = selected.path;
                });
                picker.setElement(document.querySelector('#g-dialog-container')).render();
            });
            act('#saveAdminSettingsBtn', async () => {
                adminPolicy.workspace_path = $('#workspacePath').value.trim();
                policyBooleans.forEach(key => { adminPolicy[key] = $('#' + key).checked; });
                const result = await request('settings', 'PUT', {settings: JSON.stringify(adminPolicy)});
                adminPolicy = result.settings;
                $('#workspacePath').value = adminPolicy.workspace_path;
                $('#settingsStatus').textContent = 'Settings saved. New data will use this policy.';
                await refresh();
            });
            act('#configurationStepBtn', () => configure(false));
            act('#completeWorkflowBtn', () => configure(true));
            act('#lightburnStepBtn', async () => { await refresh(); showScreen('lightburnPicker'); });
            act('#registerBtn', async () => { await refresh(); showScreen('registrationPicker'); });
            $('#registrationBackBtn').addEventListener('click', home);
            $('#submittedConfigs').addEventListener('change', renderHome);
            $('#registrationConfigs').addEventListener('change', renderHome);
            act('#generateBtn', async () => {
                await request('config/' + $('#submittedConfigs').value + '/generate', 'POST');
                await refresh(); status('Files generated.');
            });
            act('#deleteFilesBtn', async () => {
                if (!confirm('Delete this configuration’s generated files? It will return to submitted and its Stack ID can be reused.')) return;
                await request('config/' + $('#submittedConfigs').value + '/files', 'DELETE');
                await refresh(); status('Generated files deleted. Configuration is submitted.');
            });
            act('#registerStackBtn', async () => {
                await request('config/' + $('#registrationConfigs').value + '/register', 'POST');
                await refresh(); status('Stack IGSN registered. This Stack ID can no longer be reused.');
            });
            $('#configPickerBackBtn').addEventListener('click', home);
            $('#lightburnPickerBackBtn').addEventListener('click', home);
            $('#savedConfigs').addEventListener('change', () => {
                activeConfig = saved.find(record => record._id === $('#savedConfigs').value) || null;
                status(''); renderHome();
            });
            act('#buildConfigBtn', async () => {
                if (completeWorkflow && activeConfig && (activeConfig.status !== 'draft' || activeConfig.canEdit === false)) {
                    activeConfig = null;
                    $('#savedConfigs').value = '';
                }
                if (activeConfig) {
                    const template = (activeConfig.config.run_parameters || activeConfig.config.run_params)?.template;
                    if (template?.startsWith('girder:')) addPortalTemplate(await request('templates/' + encodeURIComponent(template)));
                    await importJson(new File([JSON.stringify({...activeConfig.config, ...(activeConfig.customFieldRows ? {custom_field_rows: activeConfig.customFieldRows} : {})})], activeConfig.name + '.json', {type: 'application/json'}), true);
                }
                else blank();
                $('#saveAsName').value = activeConfig?.name || '';
                setReadOnly(Boolean(activeConfig && (activeConfig.status !== 'draft' || activeConfig.canEdit === false)));
                baseline = snapshot();
                showScreen('builderScreen');
            });
            $('#studioHomeLink').addEventListener('click', event => {
                event.preventDefault();
                if (!busy && canLeave()) home();
            });
            act('#resetBtn', async () => {
                if (readOnly) return;
                if (activeConfig?.status === 'draft') await request('config/' + activeConfig._id, 'DELETE');
                activeConfig = null;
                $('#savedConfigs').value = '';
                $('#saveAsName').value = '';
                blank();
                baseline = snapshot();
                await refresh();
                showScreen('configurationPicker');
            });
            $('#backWorkflowBtn').addEventListener('click', () => { if (canLeave()) showScreen('configurationPicker'); });
            $('#editCopyBtn').addEventListener('click', () => {
                activeConfig = null;
                $('#savedConfigs').value = '';
                setReadOnly(false);
                $('#currentPageLabel').textContent = 'Configure flyer stack';
                $('#builderMode').textContent = 'Editing a copy · save creates a new configuration';
            });
            const draftObject = () => ({...configObject(), run_params: {...configObject().run_params, operator: $('#operator').value},
                custom_field_rows: state.customFields.map(({name,value}) => ({name,value}))});
            const persist = async submit => {
                const captured = snapshot();
                const config = submit ? finalConfigObject() : draftObject();
                activeConfig = await request('config', 'POST', {config: JSON.stringify(config), name: $('#saveAsName').value.trim(),
                    id: activeConfig?.status === 'draft' ? activeConfig._id : '', submit, validated: submit && $('#validationAck').checked});
                baseline = captured;
                await refresh();
            };
            act('#saveGirderBtn', async () => {
                await persist(false);
                $('#builderMode').textContent = `Saved ${savedTime(activeConfig)}`;
                toast('Draft saved.');
            });
            act('#submitConfigBtn', async () => {
                [state.submittedStackIds, state.stackStates] = await Promise.all([request('submitted-stacks'), request('stack-states')]);
                updateAll();
                if (!confirmExport()) return;
                await persist(true);
                setReadOnly(true);
                if (!completeWorkflow) {
                    home();
                    status('Configuration submitted. It is now read-only.');
                    return;
                }
                const endpoint = 'config/' + activeConfig._id;
                let stage = 'generation';
                try {
                    status('Configuration submitted. Generating files…');
                    activeConfig = await request(endpoint + '/generate', 'POST');
                    stage = 'registration';
                    status('Files generated. Registering stack IGSN…');
                    activeConfig = await request(endpoint + '/register', 'POST');
                } catch (error) {
                    await refresh();
                    showScreen(stage === 'generation' ? 'lightburnPicker' : 'registrationPicker');
                    $(stage === 'generation' ? '#submittedConfigs' : '#registrationConfigs').value = activeConfig._id;
                    renderHome();
                    throw new Error(`Automatic ${stage} stopped: ${error.message} Your saved work is retained; continue from this module.`);
                }
                await refresh();
                showScreen('registrationPicker');
                $('#registrationConfigs').value = activeConfig._id;
                renderHome();
                status('Complete: configuration submitted, files generated, and stack IGSN registered.');
            });
            const beforeUnload = event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } };
            const guardNavigation = event => {
                if (event.target.closest?.('#g-dialog-container')) return;
                const link = event.composedPath().find(node => node.tagName === 'A');
                if (link?.id === 'studioHomeLink') return;
                if (link && !canLeave()) { event.preventDefault(); event.stopImmediatePropagation(); }
            };
            window.addEventListener('beforeunload', beforeUnload);
            document.addEventListener('click', guardNavigation, true);
            this.cleanupBuilder = () => {
                clearTimeout(toast.timer);
                cleanupTooltips();
                window.removeEventListener('beforeunload', beforeUnload);
                document.removeEventListener('click', guardNavigation, true);
            };
            $('#presetSelect').innerHTML = '<option value="">No preset</option>' + state.presets.map(preset => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</option>`).join('');
            await refresh();

        },
        destroy: function () {
            this.cleanupBuilder?.();
            return View.prototype.destroy.call(this);
        }
    });
    girder.plugins.dashboards.registerDashboard('flycut-config', {view: Dashboard});
}());
