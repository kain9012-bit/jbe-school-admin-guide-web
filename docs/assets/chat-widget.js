// 길라잡이 챗봇 창. 서버 함수(/api/chat)에 질문을 보내고 답을 글자 단위로 받아
// 보여 줍니다. 대화는 이 창 안에만 있고 저장하지 않습니다.
(function () {
  const ENDPOINT = "/api/chat";
  const STARTERS = [
    "기간제 노동자 채용할 때 승인 절차가 어떻게 되나요?",
    "학교운영위원회 심의사항에는 무엇이 있나요?",
    "정근수당은 언제 누구에게 지급하나요?",
  ];
  const history = [];
  let busy = false;

  const launch = document.createElement("button");
  launch.type = "button";
  launch.className = "chat-launch";
  launch.setAttribute("aria-haspopup", "dialog");
  launch.innerHTML = `<span class="chat-launch-icon" aria-hidden="true">💬</span><span>길라잡이에게 묻기</span>`;

  const panel = document.createElement("section");
  panel.className = "chat-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "길라잡이 챗봇");
  panel.innerHTML = `
    <header class="chat-head">
      <strong>길라잡이에게 묻기<small>19편 본문과 자주 묻는 질문에서 근거를 찾아 답합니다</small></strong>
      <button type="button" data-chat-clear>대화 지우기</button>
      <button type="button" data-chat-close aria-label="닫기">닫기 ✕</button>
    </header>
    <div class="chat-log" aria-live="polite"></div>
    <div class="chat-hint">이렇게 물어보세요 ${STARTERS.map(
      (text) => `<button type="button" data-chat-starter>${escapeHtml(text)}</button>`
    ).join("")}</div>
    <form class="chat-form">
      <textarea rows="1" placeholder="궁금한 업무를 문장으로 적어 주세요" aria-label="질문"></textarea>
      <button type="submit">보내기</button>
    </form>
    <p class="chat-foot">답변은 길라잡이 원문을 요약한 것입니다. 최종 확인은 원문과 관련 법령을 우선하세요.</p>
  `;

  const log = panel.querySelector(".chat-log");
  const hint = panel.querySelector(".chat-hint");
  const form = panel.querySelector(".chat-form");
  const input = form.querySelector("textarea");
  const send = form.querySelector("button");

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }

  function open() {
    panel.hidden = false;
    launch.hidden = true;
    input.focus();
  }

  function close() {
    panel.hidden = true;
    launch.hidden = false;
    launch.focus();
  }

  function bubble(role, text) {
    const node = document.createElement("div");
    node.className = "chat-msg";
    node.dataset.role = role;
    node.textContent = text;
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
    return node;
  }

  function sourcesMarkup(sources) {
    if (!sources || !sources.length) return null;
    const list = document.createElement("ul");
    list.className = "chat-sources";
    list.setAttribute("aria-label", "근거");
    for (const one of sources) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = one.url;
      link.textContent = `[${one.n}] ${one.heading}`;
      link.title = one.heading;
      item.appendChild(link);
      list.appendChild(item);
    }
    return list;
  }

  async function ask(question) {
    if (busy || !question) return;
    busy = true;
    send.disabled = true;
    hint.hidden = true;
    bubble("user", question);
    history.push({ role: "user", content: question });
    const answer = bubble("assistant", "");
    answer.dataset.thinking = "1";
    let text = "";
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: history.slice(-7, -1) }),
      });
      if (!response.ok) {
        let message = `오류가 났습니다 (${response.status}).`;
        try {
          message = (await response.json()).error || message;
        } catch {
          // 본문이 JSON이 아니면 기본 문구를 씁니다.
        }
        throw new Error(message);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sources = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (!sources) {
          const cut = buffer.indexOf("\n");
          if (cut < 0) continue;
          try {
            sources = JSON.parse(buffer.slice(0, cut)).sources || [];
          } catch {
            sources = [];
          }
          buffer = buffer.slice(cut + 1);
          delete answer.dataset.thinking;
        }
        text += buffer;
        buffer = "";
        answer.textContent = text;
        log.scrollTop = log.scrollHeight;
      }
      if (buffer) {
        text += buffer;
        answer.textContent = text;
      }
      delete answer.dataset.thinking;
      const list = sourcesMarkup(sources);
      if (list) {
        answer.appendChild(list);
        list.querySelectorAll("a").forEach((link) => {
          link.addEventListener("click", () => {
            // 같은 편 안의 지면이면 화면이 바뀌므로 창을 닫습니다.
            close();
          });
        });
      }
      history.push({ role: "assistant", content: text });
    } catch (error) {
      answer.remove();
      bubble("error", error.message || "답변을 받지 못했습니다.");
      history.pop();
    } finally {
      busy = false;
      send.disabled = false;
      log.scrollTop = log.scrollHeight;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    input.style.height = "";
    ask(question);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  });
  panel.querySelector("[data-chat-close]").addEventListener("click", close);
  panel.querySelector("[data-chat-clear]").addEventListener("click", () => {
    log.innerHTML = "";
    history.length = 0;
    hint.hidden = false;
    input.focus();
  });
  panel.querySelectorAll("[data-chat-starter]").forEach((button) => {
    button.addEventListener("click", () => ask(button.textContent));
  });
  launch.addEventListener("click", open);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) close();
  });

  // 서버 쪽 준비(색인·API 키)가 안 되어 있으면 단추를 아예 보이지 않습니다.
  // 준비 전에 배포해도 사용자에게는 아무것도 안 보이게 하려는 것입니다.
  launch.hidden = true;
  document.body.appendChild(launch);
  document.body.appendChild(panel);
  fetch(ENDPOINT, { method: "GET" })
    .then((response) => (response.ok ? response.json() : null))
    .then((status) => {
      if (status && status.ok && status.keyConfigured) launch.hidden = false;
    })
    .catch(() => {
      // 서버 함수가 없거나(로컬 미리보기) 닿지 않으면 단추를 숨긴 채 둡니다.
    });
})();
