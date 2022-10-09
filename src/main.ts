import { readFileSync } from 'fs';
import { ExtensionInfo } from 'gnode-api/lib/extension/extensioninfo';
import WindowedExtension from './window/windowedextension.js';
import { FloorItemData, FurniData, FurniDataUtils, HDirection, HFloorItem, HMessage, Hotel, HStuff } from 'gnode-api';
import { Leaderboard } from '@/leaderboard.entity';

const SCORE_TYPES = Object.freeze(['perteam', 'mostwins', 'classic', 'fastesttime', 'longesttime']);
const CLEAR_TYPES = Object.freeze(['alltime', 'daily', 'weekly', 'monthly']);

const extensionInfo: ExtensionInfo = JSON.parse(readFileSync('./package.json', 'utf8'));
extensionInfo.name = "Leaderboard Exporter";

const ext = new WindowedExtension(extensionInfo, '--window-size=310,350');
ext.run();

let furniData: FurniData | undefined;
const leaderboardData: Map<number, FloorItemData> = new Map();

const allLeaderboards: Map<number, Leaderboard> = new Map();

ext.on('connect', async (host, connectionPort, hotelVersion, clientIdentifier, clientType) => {
  furniData = undefined;
  leaderboardData.clear();
  
  const hotel = Hotel.fromHost(host);
  if (!hotel) return;
  
  furniData = await FurniDataUtils.fetch(hotel);
  furniData.roomitemtypes.furnitype
    .filter(item => item.classname.includes('highscore'))
    .forEach(item => leaderboardData.set(item.id, item));
});

ext.interceptByNameOrHash(HDirection.TOCLIENT, 'Objects', onObjects);
ext.interceptByNameOrHash(HDirection.TOCLIENT, 'ObjectAdd', onObjectAddOrUpdate);
ext.interceptByNameOrHash(HDirection.TOCLIENT, 'ObjectUpdate', onObjectAddOrUpdate);
ext.interceptByNameOrHash(HDirection.TOCLIENT, 'ObjectsDataUpdate', onObjectsDataUpdate);
ext.interceptByNameOrHash(HDirection.TOCLIENT, 'ObjectRemove', onObjectRemove);
ext.interceptByNameOrHash(HDirection.TOCLIENT, 'OpenConnection', onOpenOrCloseConnection);
ext.interceptByNameOrHash(HDirection.TOCLIENT, 'CloseConnection', onOpenOrCloseConnection);

function onObjects(hMessage: HMessage) {
  let floorItems: HFloorItem[] = HFloorItem.parse(hMessage.getPacket());
  
  let leaderboards = floorItems
    .filter(item => leaderboardData.has(item.typeId))
    .map(item => ({
      iconSrc: `https://images.habbo.com/dcr/hof_furni/${ leaderboardData.get(item.typeId)?.revision }/${ leaderboardData.get(item.typeId)?.classname.replace('*', '_') }_icon.png`,
      id: item.id,
      scoreType: SCORE_TYPES[item.stuff[1]],
      clearType: CLEAR_TYPES[item.stuff[2]],
      scores: item.stuff.slice(3),
    }));
  
  leaderboards.forEach(board => {
    allLeaderboards.set(board.id, board);
  });
  
  ext.sendToUI(JSON.stringify({
    type: 'leaderboards',
    leaderboards
  }));
}

function onObjectAddOrUpdate(hMessage: HMessage) {
  let item: HFloorItem = new HFloorItem(hMessage.getPacket());
  
  if (leaderboardData.has(item.typeId)) {
    const board = {
      iconSrc: `https://images.habbo.com/dcr/hof_furni/${ leaderboardData.get(item.typeId)?.revision }/${ leaderboardData.get(item.typeId)?.classname.replace('*', '_') }_icon.png`,
      id: item.id,
      scoreType: SCORE_TYPES[item.stuff[1]],
      clearType: CLEAR_TYPES[item.stuff[2]],
      scores: item.stuff.slice(3),
    };
    
    ext.sendToUI(JSON.stringify({
      type: 'leaderboards',
      leaderboards: [ board ],
    }));
    
    allLeaderboards.set(board.id, board);
  }
}

// {in:ObjectsDataUpdate}{i:1}{i:2147418138}{i:6}{s:"1"}{i:2}{i:0}{i:2}{i:5}{i:1}{s:"WiredSpast"}{i:5}{i:1}{s:"WiredSpast"}
function onObjectsDataUpdate(hMessage: HMessage) {
  let packet = hMessage.getPacket();
  let n = packet.readInteger();
  for (let i = 0; i < n; i++) {
    let id = packet.readInteger();
    let category = packet.readInteger();
    let stuff = HStuff.readData(packet, category);
    
    if (category === 6) {
      let board = allLeaderboards.get(id);
      if (board) {
        board.scoreType = SCORE_TYPES[stuff[1]];
        board.clearType = CLEAR_TYPES[stuff[2]];
        board.scores = stuff.slice(3);
  
        ext.sendToUI(JSON.stringify({
          type: 'leaderboards',
          leaderboards: [ board ],
        }));
  
        allLeaderboards.set(board.id, board);
      }
    }
  }
}

function onObjectRemove(hMessage: HMessage) {
  let id = Number(hMessage.getPacket().readString());
  
  allLeaderboards.delete(id)
  ext.sendToUI(JSON.stringify({
    type: 'remove',
    id,
  }))
}

function onOpenOrCloseConnection(hMessage: HMessage) {
  allLeaderboards.clear();
  ext.sendToUI(JSON.stringify({
    type: 'clear'
  }));
}

ext.on('uiOpened', () => {
  ext.sendToUI(JSON.stringify({
    type: 'extensioninfo',
    extensionInfo
  }));
  
  ext.sendToUI(JSON.stringify({
    type: 'leaderboards',
    leaderboards: [ ...allLeaderboards.values() ],
  }));
});