import * as puppeteer from "puppeteer";

const enum ErrorStates {
    NO_LIST = "NO_LIST"
}

type SongDetails = {
    name: string;
    singer: string;
};
type SongList = SongDetails[];

//@ts-ignore
const saavn = async (
    browser: puppeteer.Browser,
    playlistName: string
): Promise<SongList> => {
    const page = await browser.newPage();

    await page.goto("https://www.saavn.com/login.php?action=login");
    await page.waitForSelector("#account .user-name");
    await page.waitForSelector("#my-music .drop .drop-scroll a");

    const playlistUrl: string = await page.evaluate((nameToLook: string) => {
        const listElements = document.querySelectorAll<HTMLLinkElement>(
            "#my-music .drop .drop-scroll a"
        );
        const playlist = Array.from(listElements)
            .map((elem) => ({
                href: elem.href,
                name: elem.innerText
            }))
            .find(
                (listName) =>
                    listName.name.toLowerCase() === nameToLook.toLowerCase()
            );

        if (playlist) {
            return playlist.href;
        }

        return ErrorStates.NO_LIST;
    }, playlistName);

    if (playlistUrl === ErrorStates.NO_LIST) {
        throw new Error("Playlist not present");
    }

    await page.goto(playlistUrl);
    await page.waitForSelector(".page-group.track-list > li .meta");

    const songList = await page.evaluate(() => {
        const songElements = document.querySelectorAll<HTMLElement>(
            ".page-group.track-list > li .meta"
        );

        return Array.from(songElements)
            .map((elem) => elem.querySelectorAll<HTMLLinkElement>("a"))
            .map((elem) => ({
                name: elem[0].innerText,
                singer: elem[1].innerText
            }));
    });

    return songList;
};

//@ts-ignore
const gaana = async (
    browser: puppeteer.Browser,
    playlistName: string,
    songList: SongList
) => {
    const searchUrl = "https://gaana.com/search";

    const page = await browser.newPage();
    await page.goto("https://gaana.com/");

    await page.click(".login.open-popup.desktop");
    await page.waitForSelector(".login-profile.login-profile-web");

    await page.goto("https://gaana.com/music");
    await page.click(".createplaylist > a");
    await page.waitForSelector("#playlist_name");
    await page.type("#playlist_name", playlistName);
    await page.click("#createplaylist_btn");

    await page.waitForSelector("._mymusic .card_layout .carousel_ul");

    for (const songItem of songList) {
        const itemPage = page.goto(`${searchUrl}/${songItem.name}`);
    }
};

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        timeout: 0
    });

    const playListName = "punjabi";

    try {
        const songList = await saavn(browser, playListName);

        console.log(songList);
        // await gaana(browser, playListName, songList);
    } catch (e) {
        console.error(e);
    }

    await browser.close();
})();
