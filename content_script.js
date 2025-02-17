class Video {
    constructor(partnerID, partnerID2 ,entryID) {
        this.partnerID = partnerID;
        this.partnerID2 = partnerID2;
        this.entryID = entryID;
    }
    async getVideoInfo(){
        return await fetchVideoMetaData(this);
    }
}

class VideoInfo {
    constructor(videoName, duration, url) {
        this.videoName = videoName;
        this.duration = duration;
        this.url = url;
    }
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === "reload"){
        await initialize(window.document);
    } else {
        if (!inIframe()){
            console.log("req", request.url)
            let alink = document.createElement('a');
            alink.href = request.url;
            alink.target = "_blank";
            alink.click();
        }
    }
    sendResponse({});
    return true;
});

async function fetchVideoMetaData(video) {
    // Make request only if video has required ids.
    if (!video.partnerID || !video.partnerID2 || !video.entryID) return new VideoInfo();
    const queryURL = `https://cdnapi.kaltura.com/api_v3/index.php?apiVersion=3.1.5&format=1&service=multirequest&1%3Aexpiry=86400&1%3Aservice=session&1%3Aaction=startWidgetSession&1%3AwidgetId=_${video.partnerID}&2%3Aaction=get&2%3AentryId=${video.entryID}&2%3Aservice=baseentry&2%3Aks=%7B1%3Aresult%3Aks%7D&2%3AresponseProfile%3Afields=createdAt%2CdataUrl%2Cduration%2Cname%2Cplays%2CthumbnailUrl%2CuserId&2%3AresponseProfile%3Atype=1&3%3Aaction=getbyentryid&3%3AentryId=${video.entryID}&3%3Aservice=flavorAsset&3%3Aks=%7B1%3Aresult%3Aks%7D`
    
    const response = await fetch(queryURL);
    const res = await response.json();
    if (!res) {
        return [new VideoInfo(null, null, null)];
    }
    let minBitRate = -1;
    let flavorID = null;
    for (let video of res[2]){
        if (video.bitrate > minBitRate){
            flavorID = video.id;
            minBitRate = video.bitrate;
        }
    }
    if (minBitRate !== -1){
        const url = `https://cdnapi.kaltura.com/p/${video.partnerID}/sp/${video.partnerID2}/playManifest/entryId/${video.entryID}/format/url/protocol/http/flavorId/${flavorID}`;
        return new VideoInfo(res[1].name, res[1].duration, url);
    } else {
        return new VideoInfo(null, null, null);
    }
}

function inIframe () {
    // Check if window is iframe or not.
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

function getIDFromImgTag(i){
    const regex = "https?://cfvod.kaltura.com/p/([^/]+)/sp/([^/]+)/thumbnail/entry_id/([^/]+)";
    const r = i.src.match(regex);
    return (r && r.length === 4) ? new Video(r[1], r[2], r[3]) : null
}

function getIDFromVideoTag(i){
    if (i && i.hasAttribute("kpartnerid") && i.hasAttribute("kentryid")){
        console.log("i", i.getAttribute("kentryid"), i.id)
        console.log("video", new Video(i.getAttribute("kpartnerid"), i.getAttribute("kpartnerid")+"00", i.getAttribute("kentryid")))
        return new Video(i.getAttribute("kpartnerid"), i.getAttribute("kpartnerid")+"00", i.getAttribute("kentryid"));
    } else return null
}

async function initialize(document) {
    let frameTags = document.getElementsByTagName("iframe");
    Array.prototype.forEach.call(frameTags, async function (frame) {
        try {
            var childDocument = frame.contentDocument;
        } catch (e) {
            return;
        }
        await main(childDocument);
    });
    let imgTags = document.querySelectorAll('img');
    let videoTag = document.querySelector('video');

    let videoIDList = [];
    for (let i of imgTags) {
        const match = getIDFromImgTag(i);
        if (match) videoIDList.push(match);
    }
    const res = getIDFromVideoTag(videoTag);
    if(res){ videoIDList.push(res); }


    let pendingList = [];
    for (let v of videoIDList){
        pendingList.push(v.getVideoInfo())
    }

    let videoInfoList = [];
    for (const pending of pendingList) {
        try {
            const result = await pending;
            if (result !== null) {
                videoInfoList.push(result);
            }
        } catch (err) {
            console.log(err);
        }
    }

    console.log(videoInfoList)
    await chrome.runtime.sendMessage({message: videoInfoList});
}

async function main(document) {
    if (document) {
        if (document.readyState === "complete") {
            await initialize(document);
        } else {
            document.onreadystatechange = async () => {
                if (document.readyState === "complete") {
                    await initialize(document);
                }
            };
        }
    }
}

window.onload = async () => {
    await initialize(window.document);
};
