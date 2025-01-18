// main.js

/********************
 * 1. 側邊導航欄控制 *
 ********************/
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("open");
}

/********************
 * 2. 筆記儲存功能  *
 ********************/
function saveNote() {
  const title = document.getElementById("noteTitle").value.trim();
  const category = document.getElementById("noteCategory").value;
  const content = document.getElementById("noteContent").value.trim();

  if (!title) {
    alert("請輸入標題！");
    return;
  }

  // 從 localStorage 中取得現有筆記陣列
  let notes = JSON.parse(localStorage.getItem("focusNotes")) || [];

  // 建立新的筆記物件
  const newNote = {
    id: Date.now(), // 簡易唯一ID
    title: title,
    category: category,
    content: content,
  };

  // 將新筆記加入陣列
  notes.push(newNote);

  // 儲存回 localStorage
  localStorage.setItem("focusNotes", JSON.stringify(notes));

  alert("筆記已儲存！");
  // 儲存後自動跳轉回列表頁（可自行斟酌）
  window.location.href = "notes.html";
}

/********************
 * 3. 讀取並顯示筆記 *
 ********************/
function loadNotes() {
  const notes = JSON.parse(localStorage.getItem("focusNotes")) || [];
  // 將筆記根據分類分組
  const grammarContainer = document.getElementById("grammarNotes");
  const vocabContainer = document.getElementById("vocabNotes");
  const othersContainer = document.getElementById("otherNotes");

  // 先清空
  grammarContainer.innerHTML = "";
  vocabContainer.innerHTML = "";
  othersContainer.innerHTML = "";

  notes.forEach((note) => {
    const card = document.createElement("div");
    card.classList.add("card");
    card.innerHTML = `
      <h3>${note.title}</h3>
      <p>${note.content.slice(0, 50)}...</p>
      <button class="btn" onclick="viewNote(${note.id})">查看</button>
    `;

    // 根據分類放到對應區域
    if (note.category === "grammar") {
      grammarContainer.appendChild(card);
    } else if (note.category === "vocab") {
      vocabContainer.appendChild(card);
    } else {
      othersContainer.appendChild(card);
    }
  });
}

/****************************
 * 4. 搜尋筆記(即時篩選示範) *
 ****************************/
function filterNotes() {
  const keyword = document.getElementById("searchInput").value.toLowerCase();
  const cards = document.querySelectorAll(".card-grid .card");

  cards.forEach((card) => {
    const title = card.querySelector("h3")?.textContent.toLowerCase() || "";
    const content = card.querySelector("p")?.textContent.toLowerCase() || "";

    if (title.includes(keyword) || content.includes(keyword)) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}

/**********************************
 * 5. 檢視單一筆記 (示意性功能)   *
 **********************************/
function viewNote(noteId) {
  // 此處可導向詳細頁面或彈出視窗顯示完整內容
  // 簡單示範：
  const notes = JSON.parse(localStorage.getItem("focusNotes")) || [];
  const note = notes.find((n) => n.id === noteId);
  if (note) {
    alert(`標題: ${note.title}\n內容: ${note.content}`);
  }
}

/********************************
 * 6. 單字測驗 (簡易示範)       *
 ********************************/
const vocabData = [
  { word: "abandon", meaning: "放棄" },
  { word: "benefit", meaning: "好處" },
  { word: "candidate", meaning: "候選人" },
  { word: "dedicate", meaning: "致力於" },
  // ...可自行擴充
];

let currentQuestionIndex = null;

function nextQuestion() {
  if (vocabData.length === 0) return;
  // 隨機取一個單字
  const randomIndex = Math.floor(Math.random() * vocabData.length);
  currentQuestionIndex = randomIndex;
  const questionWord = vocabData[randomIndex].word;

  // 顯示問題
  document.getElementById("questionText").textContent = `「${questionWord}」的中文是？`;

  // 產生四個選項 (包含正確答案 + 3個隨機)
  const options = [];
  options.push(vocabData[randomIndex].meaning); // 正確答案

  // 先隨機擷取其他答案
  while (options.length < 4) {
    const idx = Math.floor(Math.random() * vocabData.length);
    if (idx !== randomIndex && !options.includes(vocabData[idx].meaning)) {
      options.push(vocabData[idx].meaning);
    }
  }

  // 打亂選項順序
  options.sort(() => 0.5 - Math.random());

  // 動態生成按鈕
  const answerOptionsDiv = document.getElementById("answerOptions");
  answerOptionsDiv.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.textContent = opt;
    btn.onclick = () => checkAnswer(opt);
    answerOptionsDiv.appendChild(btn);
  });
}

function checkAnswer(selectedMeaning) {
  if (currentQuestionIndex == null) return;
  const correct = vocabData[currentQuestionIndex].meaning;
  if (selectedMeaning === correct) {
    alert("恭喜你，答對了！");
  } else {
    alert(`答錯了，正確答案是：${correct}`);
  }
}

/******************************
 * 7. 單字列表顯示/搜尋功能   *
 ******************************/
function loadVocabList() {
  const tbody = document.querySelector("#vocabTable tbody");
  tbody.innerHTML = "";

  vocabData.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.word}</td>
      <td>${item.meaning}</td>
    `;
    tbody.appendChild(row);
  });
}

function filterVocabList() {
  const keyword = document.getElementById("vocabSearch").value.toLowerCase();
  const rows = document.querySelectorAll("#vocabTable tbody tr");

  rows.forEach((row) => {
    const word = row.children[0].textContent.toLowerCase();
    const meaning = row.children[1].textContent.toLowerCase();
    if (word.includes(keyword) || meaning.includes(keyword)) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

/******************************
 * 8. 初始化頁面時載入         *
 ******************************/
window.addEventListener("DOMContentLoaded", () => {
  // 在 notes.html 執行載入筆記
  if (document.title.includes("筆記列表")) {
    loadNotes();
  }

  // 在 vocabulary.html 執行載入單字列表
  if (document.title.includes("單字練習")) {
    loadVocabList();
  }
});
