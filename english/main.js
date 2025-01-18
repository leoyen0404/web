/********************
 * 全域變數 (單字)   *
 ********************/
let vocabData = [];
let currentQuestionIndex = 0; // 當前測驗題目的索引

/********************
 * 1. 側邊欄控制     *
 ********************/
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("open");
}

/********************
 * 2. 載入筆記 JSON  *
 ********************/
async function loadNotesJSON() {
  try {
    const response = await fetch("notes.json");
    const notes = await response.json();

    const grammarContainer = document.getElementById("grammarNotes");
    const vocabContainer = document.getElementById("vocabNotes");
    const translationContainer = document.getElementById("translationNotes");
    const othersContainer = document.getElementById("othersNotes");

    grammarContainer.innerHTML = "";
    vocabContainer.innerHTML = "";
    translationContainer.innerHTML = "";
    othersContainer.innerHTML = "";

    notes.forEach(note => {
      const card = document.createElement("div");
      card.classList.add("card");
      card.innerHTML = `
        <h3>${note.title}</h3>
        <p>${note.content}</p>
      `;

      switch(note.category) {
        case "grammar":
          grammarContainer.appendChild(card);
          break;
        case "vocab":
          vocabContainer.appendChild(card);
          break;
        case "translation":
          translationContainer.appendChild(card);
          break;
        default:
          othersContainer.appendChild(card);
          break;
      }
    });
  } catch (error) {
    console.error("載入 notes.json 失敗：", error);
  }
}

/****************************
 * 3. 搜尋筆記(即時篩選)    *
 ****************************/
function filterNotes() {
  const keyword = document.getElementById("searchInput").value.toLowerCase();
  const allCards = document.querySelectorAll(".card-grid .card");

  allCards.forEach(card => {
    const text = card.innerText.toLowerCase();
    card.style.display = text.includes(keyword) ? "block" : "none";
  });
}

/********************
 * 4. 載入單字 JSON  *
 ********************/
async function loadVocabJSON() {
  try {
    const response = await fetch("vocab.json");
    vocabData = await response.json();
    displayVocabList(vocabData);
  } catch (error) {
    console.error("載入 vocab.json 失敗：", error);
  }
}

/*******************************************
 * 5. 偵測捲動事件 - 一旦捲動即解除模糊     *
 *******************************************/
function handleScroll() {
  const vocabList = document.querySelector(".vocab-list");
  if (vocabList && vocabList.classList.contains("blurred")) {
    vocabList.classList.remove("blurred");
  }
}

/***********************************
 * 6. 再度給單字列表套上模糊效果   *
 ***********************************/
function blurVocabList() {
  const vocabList = document.querySelector(".vocab-list");
  if (vocabList) {
    vocabList.classList.add("blurred");
  }
}

/************************************
 * 7. 單字測驗 - 產生下一題(隨機)   *
 ************************************/
function nextQuestion() {
  if (!vocabData.length) return;

  // 每次按「下一題」時，先把單字列表重新模糊
  blurVocabList();

  currentQuestionIndex = Math.floor(Math.random() * vocabData.length);
  const questionWord = vocabData[currentQuestionIndex].word;
  const correctMeaning = vocabData[currentQuestionIndex].meaning;

  document.getElementById("questionText").textContent = `「${questionWord}」的中文是？`;

  // 建立含正確答案的選項
  let options = [correctMeaning];
  while (options.length < 4) {
    const randIdx = Math.floor(Math.random() * vocabData.length);
    const randMeaning = vocabData[randIdx].meaning;
    if (!options.includes(randMeaning)) {
      options.push(randMeaning);
    }
  }
  // 打亂順序
  options.sort(() => Math.random() - 0.5);

  // 產生選項按鈕
  const answerOptionsDiv = document.getElementById("answerOptions");
  answerOptionsDiv.innerHTML = "";

  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.textContent = opt;
    btn.addEventListener("click", () => checkAnswer(btn, opt));
    answerOptionsDiv.appendChild(btn);
  });
}

/************************************************
 * 8. 檢查答案 - 答對(綠)後短暫延遲再下一題(0.4秒) *
 ************************************************/
function checkAnswer(btn, selected) {
  const correct = vocabData[currentQuestionIndex].meaning;
  if (selected === correct) {
    // 答對 -> 綠色
    btn.style.backgroundColor = "green";
    // 0.4 秒後自動換題
    setTimeout(() => {
      nextQuestion();
    }, 400);
  } else {
    // 答錯 -> 紅色, 停留不動
    btn.style.backgroundColor = "red";
  }
}

/********************
 * 9. 顯示單字列表  *
 ********************/
function displayVocabList(data) {
  const tbody = document.querySelector("#vocabTable tbody");
  tbody.innerHTML = "";

  data.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.word}</td>
      <td>${item.meaning}</td>
    `;
    tbody.appendChild(tr);
  });
}

/******************************
 * 10. 搜尋單字列表           *
 ******************************/
function filterVocabList() {
  const keyword = document.getElementById("vocabSearch").value.toLowerCase();
  const filtered = vocabData.filter(item =>
    item.word.toLowerCase().includes(keyword) ||
    item.meaning.toLowerCase().includes(keyword)
  );
  displayVocabList(filtered);
}

/********************************
 * 11. DOMContentLoaded - 初始化 *
 ********************************/
document.addEventListener("DOMContentLoaded", () => {
  // notes.html => 載入筆記
  if (document.title.includes("重點筆記")) {
    loadNotesJSON();
  }

  // vocabulary.html => 載入單字 & 監聽捲動
  if (document.title.includes("單字練習")) {
    loadVocabJSON();
    window.addEventListener("scroll", handleScroll);
  }
});
