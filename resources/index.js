const params = window.location.search
  .replace('?', '')
  .split('&')
  .map(p => p.split('='))
  .reduce((map, val) => map.set(val[0], val[1]), new Map());

let boardList;
let boardTable;

window.onload = () => {
  boardList = document.getElementById('boardList');
  boardTable = document.getElementById('boardTable');
  document.addEventListener('copy', function (e) {
    let selectedText = window.getSelection().toString().trim();
    if (window.clipboardData) {
      window.clipboardData.setData('text/plain', selectedText);
    } else {
      e.clipboardData.setData('text/plain', selectedText);
    }
    
    e.preventDefault();
  });
}

webSocket = new WebSocket(`ws://localhost:${ params.get('port') }`);

webSocket.onmessage = (e) => {
  let data = JSON.parse(e.data);
  switch (data.type) {
    case 'clear':
      onClear(data);
      break;
    case 'leaderboards':
      addOrUpdateBoards(data.leaderboards);
      break;
    case 'remove':
      removeBoard(data.id);
      break;
    case 'extensioninfo':
      onExtensionInfo(data.extensionInfo);
      break;
  }
}

function addOrUpdateBoards(leaderboards) {
  for (let board of leaderboards) {
    for (let boardImg of [...boardList.childNodes]) {
      if (Number(boardImg.dataset.id) === board.id) {
        boardImg.remove();
      }
    }
    
    let boardImg = document.createElement('img');
    boardImg.classList.add('board');
    boardImg.dataset.id = board.id;
    boardImg.dataset.scoreType = board.scoreType;
    boardImg.dataset.clearType = board.clearType;
    boardImg.dataset.scores = JSON.stringify(board.scores);
    boardImg.crossOrigin = 'anonymous';
    boardImg.setAttribute('src', board.iconSrc);
    boardImg.setAttribute('onclick', 'openBoard(this);');
    
    boardList.appendChild(boardImg);
    
    if (boardTable.dataset.id === boardImg.dataset.id) {
      openBoard(boardImg);
    }
  }
}

function removeBoard(id) {
  for (let boardImg of [...boardList.childNodes]) {
    if (boardImg.dataset.id === id) {
      boardImg.remove();
    }
  }
  
  if (boardTable.dataset.id === id) {
    newTableBody(boardTable);
  }
}

function openBoard(boardImg) {
  boardTable.tHead.rows[0].cells[1].innerHTML = ['fastesttime', 'longesttime'].includes(boardImg.dataset.scoreType) ? 'Time' : 'Score';
  let body = newTableBody(boardTable);
  
  boardTable.dataset.id = boardImg.dataset.id;
  boardTable.dataset.scoreType = boardImg.dataset.scoreType;
  boardTable.dataset.clearType = boardImg.dataset.clearType;
  
  let index = 1;
  let scores = JSON.parse(boardImg.dataset.scores);
  for (let i = 0; i < scores[0]; i++) {
    let score = scores[index++];
    let winners = [];
    let winner_count = scores[index++];
    for (let j = 0; j < winner_count; j++) {
      winners.push(scores[index++]);
    }
    
    let row = body.insertRow();
    row.insertCell().innerHTML = winners.join(', ');
    row.insertCell().innerHTML = ['fastesttime', 'longesttime'].includes(boardImg.dataset.scoreType) ? formatTime(score) : score;
  }
}

function formatTime(totalSeconds) {
  let seconds = totalSeconds % 60;
  let minutes = Math.floor((totalSeconds % 3600) / 60);
  let hours = Math.floor(totalSeconds / 3600);
  
  return `${ hours > 0 ? `${hours}:` : '' }${ minutes.toString(10).padStart(2, '0') }:${ seconds.toString(10).padStart(2, '0') }`;
}

function newTableBody(boardTable) {
  boardTable.dataset.id = undefined;
  boardTable.dataset.scoreType = undefined;
  boardTable.dataset.clearType = undefined;
  
  let body = boardTable.tBodies.item(0);
  const new_body = document.createElement('tbody');
  
  boardTable.replaceChild(new_body, body);
  
  return new_body;
}

function onExtensionInfo(extensionInfo) {
  for (let title of document.getElementsByTagName('title')) {
    title.innerHTML = `${ extensionInfo.name } ${ extensionInfo.version }`;
  }
}

function onClear(data) {
  boardList.innerHTML = '';
  newTableBody(boardTable);
}

document.addEventListener('contextmenu', function(e) {
  e.preventDefault();
}, false);

async function getNewCSVFileHandle() {
  const opts = {
    excludeAcceptAllOption: true,
    suggestedName: `${ boardTable.dataset.scoreType }_${ boardTable.dataset.clearType }_${ boardTable.dataset.id }`,
    types: [{
      description: 'CSV file',
      accept: {'text/csv': ['.csv']},
    }],
  };
  return await window.showSaveFilePicker(opts);
}

async function exportToCSV(button) {
  if (!boardTable.dataset.id) {
    button.classList.add('error', 'empty');

    setTimeout(() => {
      button.classList.remove('error', 'empty');
    }, 2500);
  } else {
    try {
      const handle = await getNewCSVFileHandle();
      const stream = await handle.createWritable();
      await stream.write(boardToCSV());
      await stream.close();
      
      button.classList.add('success');
  
      setTimeout(() => {
        button.classList.remove('success');
      }, 2500);
    } catch (e) {
      console.error(e);
      button.classList.add('error', 'canceled');
  
      setTimeout(() => {
        button.classList.remove('error', 'canceled');
      }, 2500);
    }
  }
}

function boardToCSV() {
  let csv_data = [];
  
  csv_data.push(`users,${ ['fastesttime', 'longesttime'].includes(boardTable.dataset.scoreType) ? 'time' : 'score' }`)
  
  for (let row of [...boardTable.rows].slice(1)) {
    csv_data.push(`"${ row.cells[0].innerHTML }",${ row.cells[1].innerHTML }`);
  }
  
  return csv_data.join('\n');
}
