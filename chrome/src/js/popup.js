// google analytics
var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-117099737-1']);
_gaq.push(['_trackPageview', '/popup']);
_gaq.push(['_trackPageLoadTime']);

(function() {
  var ga = document.createElement('script');
  ga.type = 'text/javascript'; ga.async = true;
  ga.src = 'https://ssl.google-analytics.com/ga.js';
  var s = document.getElementsByTagName('script')[0];
  s.parentNode.insertBefore(ga, s);
})();

document.addEventListener('DOMContentLoaded', function () {
  let link = document.getElementById('addBtn')
  let yahooAdd = document.getElementById('importBtn')
  // onClick's logic below:
  link.addEventListener('click', handleIdInput)
  yahooAdd.addEventListener('click', handleYahooImport)

  document.getElementById('notifBtn').addEventListener('click', handleNotifBtnClick)
  document.getElementById('muteBtn').addEventListener('click', handleMuteBtnClick)
})

let toggleNotification = true
let isMuted = false

sendMessageToBackGround('getNotif', null)
sendMessageToBackGround('getIsMuted', null)

// communication without background.js
chrome.runtime.onMessage.addListener(function (req, sender, sendResponse) {
  if (req.source === 'background') {
    $('#tbody').html('')

    req.data
      .sort((a, b) => {
        // complex sorting algorithm
        // basically try to "estimate" how long until a player is playing again
        if (a.data.isPitching && !a.data.isSideBatting) {
          return -1
        } else if (b.data.isPitching && !b.data.isSideBatting) {
          return 1
        }

        if (a.data.gameStatus != 'L') {
          return 1
        } else if (b.data.gameStatus != 'L') {
          return -1
        }

        if (a.data.isSideBatting === b.data.isSideBatting) {
          return a.data.order - b.data.order
        }

        let left = a.data.order + (a.data.isSideBatting ? -3 : 0)
        let right = b.data.order + (b.data.isSideBatting ? -3 : 0)

        return left - right
      })
      .forEach(row => {
        populateRow(row)
      })
  } else if (req.source === 'notification') {
    toggleNotification = req.data
    changeNotifButton(toggleNotification)
  } else if (req.source === 'mute') {
    isMuted = req.data
    changeMuteBtn(isMuted)
  }
})

window.onload = function () {
  poll()
}

const positionMap = [
  'n/a',
  'P',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
  'DH',
  'PH'
]

// populating table
// expecting data to be an array of well formed json objects
function getOrder (id, data) {
  let orderTxt
  let bold = false

  if (!data.gameStatus) {
    // formerly 'not playing'
    return ''
  } else if (data.gameStatus === 'F') {
    return ''
  } else if (data.gameStatus !== 'L') {
    return 'Game Scheduled'
  }

  let order = data.order

  if (order === -1) {
    if (data.isPitching) {
      if (!data.isSideBatting) {
        return '<b>Pitching</b>'
      } else {
        return 'Team At Bat (Pitching)'
      }
    }
  } else if (order === 0) {
    orderTxt = 'Batting'
    bold = true
  } else if (order === 1) {
    orderTxt = 'On Deck'
    bold = true
  } else if (order === 2) {
    orderTxt = 'In the Hole'
    bold = true
  } else if (order <= 9) {
    orderTxt = `Due ${order + 1}th`
  } else {
    return data.position == 1 ? 'Not Pitching' : 'Not Playing'
  }

  // notify if side is not batting
  if (!data.isSideBatting) {
    orderTxt = `On Defense (${orderTxt})`
  } else if (bold) {
    orderTxt = `<b>${orderTxt}</b>`
  }

  return orderTxt
}

function getMLBTVHtml (data) {
  let mlbtv = data.mlbTVLink

  if (data.gameStatus !== 'L') {
    return ''
  }

  return `<button id='btn_${mlbtv}' name='${data.name}' value='${mlbtv}' class='btn btn-link mlbtv-link'>MLB TV <i class="mlbtv-link-icon material-icons">launch</i></button>`
}

// gets the score data for the game
// e.g. TOR 3-1 NYY
function getGameScoreData(rawData) {
  // if game not started then don't show score
  if (!rawData.data.gameStatus || (rawData.data.gameStatus !== 'L' && rawData.data.gameStatus !== 'F' && rawData.data.gameStatus !== 'P') ) {
    return ''
  }

  const scoreData = {
    homeScore: rawData.data.homeScore,
    awayScore: rawData.data.awayScore,
    homeTeam: rawData.data.homeTeam,
    awayTeam: rawData.data.awayTeam
  }

  // if in preview, i.e. scheduled, just show teams
  if (rawData.data.gameStatus === 'P') {
    return `${scoreData.homeTeam} vs ${scoreData.awayTeam}`
  }

  const bold = rawData.data.gameStatus === 'F'

  const html = `${scoreData.homeTeam} ${scoreData.homeScore} - ${scoreData.awayScore} ${scoreData.awayTeam}`

  if (bold) {
    // if postponed then show nothing since there was no score
    if (rawData.data.isPostponed) {
      return ``
    }

    return `<b>${html}</b>`
  } else {
    return html
  }
}

// gets the inning information
// e.g. BOT 3
function getInningData(rawData) {
  // if scheduled then show scheduled time
  // e.g. 7:05 ET
  if (rawData.data.gameStatus === 'P' && rawData.data.gameTime) {
    const dateTime = new Date(rawData.data.gameTime)
    const hours = dateTime.getHours()
    const minutes = dateTime.getMinutes().toString()
    const timeZone = dateTime.toLocaleTimeString('en-us',{timeZoneName:'short'}).split(' ')[2]

    return `${hours}:${minutes.padStart(2, '0')} ${timeZone}`
  }

  // final score
  if (rawData.data.gameStatus === 'F') {
    if (rawData.data.isPostponed) {
      return `<b>Postponed</b>`
    }

    // TODO: maybe add information for if there was extra innings

    return `<b>Final</b>`
  }

  // if game not started then don't show score
  if (!rawData.data.gameStatus || rawData.data.gameStatus !== 'L') {
    return ''
  }

  const inning = rawData.data.currentInning
  const side = rawData.data.isTopInning ? 'Top' : 'Bot'

  if (inning) {
    return `${side} ${inning}`
  } else {
    return ''
  }
}

function populateRow (rawData) {
  let order = getOrder(rawData.id, rawData.data)
  let position = rawData.data.position ? positionMap[rawData.data.position] : ''

  let scoreData = getGameScoreData(rawData)
  let inningData = getInningData(rawData)

  let link = getMLBTVHtml(rawData.data)
  let html = convertToRow(rawData.id, rawData.data.img, rawData.data.name, order, position, link, scoreData, inningData)
  $('#tbody').append(html)

  // add listener for remove buttons
  document.getElementById(`btn_${rawData.id}`).addEventListener('click', remove)

  // remove button
  Array.from(document.getElementsByClassName('remove-button')).forEach(element => {
    element.addEventListener('click', remove)
  })

  // mlbtv listener
  Array.from(document.getElementsByClassName('mlbtv-link')).forEach(element => {
    element.addEventListener('click', openTab)
  })

  // on error
  Array.from(document.getElementsByClassName('p-icon')).forEach(element => {
    element.addEventListener('error', handleImgNotFound)
  })
}

// convert data into an html row
// ScoreData = {homeTeam, awayTeam, homeScore, awayScore}
function convertToRow (id, img, name, order, position, mlbtv, scoreData, inningData) {
  return `
    <tr id=${id}>
      <td scope="row"><img class='p-icon' id=img_${id} src=${img}></img></td>
      <td><b>${name}</b>, <i>${position}</i></td>
      <td>${order}</td>
      <td>${scoreData}</td>
      <td>${inningData}</td>
      <td>${mlbtv}</td>
      <td><button id=btn_${id} name=${id} value='${name}' class='btn remove-button'>X</button></td>
    </tr>
  `
}

function handleIdInput () {
  let name = $('#nameInput').val()
  let id = $('#playerId').val()

  let player = findPlayer(name, id)

  if (player.id && player.id !== 0) {
    sendMessageToBackGround('insert', player.id)
    $('#nameInput').val('')
    $('#playerId').val('')
    _gaq.push(['_trackEvent', player.name, 'add player'])
  } else {
    alert('Player not found. Please use the autocomplete.')
    _gaq.push(['_trackEvent', name, 'add player (not found)'])
  }
}

function normalizeName (name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function populate (html) {
  let players = html.match(/(?<=[0-9]+".*_blank">).*(?=<\/a>)/gm);
  players = players.map(player => normalizeName(player));
  players.forEach(player => {
    sendMessageToBackGround('insert', findPlayerByName(player).id);
  });
}

function handleYahooImport () {
  let id = $('#yahooInput').val()

  $.ajax({
    url: `https://baseball.fantasysports.yahoo.com/b1/${id}`,
    type: 'get',
    dataType: 'html',
    crossDomain: true,
    success: populate
  })
}

function openTab(args) {
  let link = args.target.value
  chrome.tabs.create({url: link})
  $('#nameInput').val('')
  _gaq.push(['_trackEvent', args.target.name, 'open Tab'])
}

function remove (args) {
  let id = args.target.name
  // remove from list
  $(`#${id}`).html('')

  _gaq.push(['_trackEvent', args.target.value, 'remove player'])

  sendMessageToBackGround('delete', id)
}

// send a message to the background
function sendMessageToBackGround (action, data) {
  chrome.runtime.sendMessage({
    source: 'popup',
    action: action,
    data: data
  })
}

// polls the background.js to get an update
function poll () {
  chrome.runtime.sendMessage({
    source: 'popup',
    action: 'poll'
  })
}

const ERR_IMG_URL = chrome.extension.getURL("img/white.jpg")
function handleImgNotFound (args) {
  let id = args.target.id

  $(`#${id}`).attr('src', ERR_IMG_URL)
}

function handleNotifBtnClick (args) {
  toggleNotification = !toggleNotification
  changeNotifButton(toggleNotification)
  sendMessageToBackGround('toggleNotif', toggleNotification)
  _gaq.push(['_trackEvent', toggleNotification, 'toggle notification'])
}

function changeNotifButton (toggle) {
  let newClass = `btn `
  let text = 'Turn Off Notifications'

  if (!toggle) {
    newClass += ` btn-primary`
    text = 'Turn On Notifications'
  } else {
    newClass += ` btn-danger`
  }

  $('#notifBtn').attr('class', newClass).html(text)
}

function handleMuteBtnClick(args) {
  isMuted = !isMuted
  changeMuteBtn(isMuted)
  sendMessageToBackGround('toggleMute', isMuted)
  _gaq.push(['_trackEvent', isMuted, 'mute notification'])
}

function changeMuteBtn(toggle) {
  let newClass = `btn `
  let text = 'Mute'

  if (toggle) {
    newClass += ` btn-primary`
    text = 'Unmute'
  } else {
    newClass += ` btn-danger`
  }

  $('#muteBtn').attr('class', newClass).html(text)
}
