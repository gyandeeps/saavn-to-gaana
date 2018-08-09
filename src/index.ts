import * as puppeteer from "puppeteer";
import { escape } from "querystring";

const enum ErrorStates {
    NO_LIST = "NO_LIST"
}

type SongDetails = {
    name: string;
    singer: string;
    album: string;
    year: number;
};
type SongList = SongDetails[];

type SuggestionDetails = {
    trackId: number;
    url: string;
};
type SuggestionList = SuggestionDetails[];

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

    const songList: SongList = await page.evaluate(() => {
        const songElements = document.querySelectorAll<HTMLElement>(
            ".page-group.track-list > li"
        );

        return Array.from(songElements)
            .map((elem) => ({
                meta: elem.querySelectorAll<HTMLLinkElement>(
                    ".main > .meta > a"
                ),
                title: elem.querySelector<HTMLLinkElement>(".main > .title > a")
            }))
            .map(
                ({ meta, title }): SongDetails => ({
                    name: (title && title.innerText) || "",
                    album: meta[0].innerText,
                    singer: meta[1].innerText,
                    year: parseInt(meta[2].innerText, 10)
                })
            );
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
    await page.setViewport({
        height: 768,
        width: 1200
    });
    await page.waitForSelector(".login-profile.login-profile-web");
    await page.click(".login.open-popup.desktop");
    await page.click(".login.open-popup.desktop");
    await page.waitForSelector(".login-img > img", { timeout: 0 });

    await page.goto("https://gaana.com/music");
    await page.waitForSelector(".mymsc > .createplaylist");
    await page.waitFor(3000);
    await page.waitForSelector(".mymsc > .createplaylist > a", {
        visible: true
    });
    await page.waitFor(1000);
    await page.click(".mymsc > .createplaylist > a");
    await page.waitFor(3000);
    await page.click(".mymsc > .createplaylist > a");
    await page.waitFor(3000);
    await page.waitForSelector("#playlist_name", { visible: true });
    await page.waitFor(3000);
    await page.type("#playlist_name", playlistName);
    await page.waitForSelector(".following > .createplaylist > svg", {
        visible: true
    });
    await page.click(".following > .createplaylist > svg");
    await page.waitFor(3000);

    await page.waitForSelector("._mymusic .card_layout .carousel_ul");

    for (const songItem of songList) {
        const songUrl = `${searchUrl}/${escape(songItem.name)}`;
        console.log(songUrl);
        await page.goto(songUrl);
        await page.waitFor(3000);
        await page.waitForSelector(".search-box .songlist-type2");

        const suggestionList: SuggestionList = await page.evaluate(() => {
            const songElements = document.querySelectorAll<HTMLElement>(
                ".songlist-type2 > ul > li .item > span"
            );

            return Array.from(songElements)
                .map((elem) => JSON.parse(elem.innerText))
                .map((item) => ({
                    trackId: item.id,
                    url: item.share_url
                }));
        });

        for (const suggestion of suggestionList) {
            const songPage = await browser.newPage();

            await songPage.goto(
                `https://gaana.com${suggestion.url.replace("\\", "")}`
            );
            await songPage.waitForSelector(
                ".details-list-paddingnone.content-container.albumlist"
            );

            const addToPlaylistClicked: boolean = await songPage.evaluate(
                (trackId, artistName, albumName) => {
                    const songElements = document.querySelector<HTMLElement>(
                        `li[data-value="song${trackId}"]`
                    );

                    if (songElements) {
                        const infoItem = songElements.querySelector<
                            HTMLElement
                        >(`#parent-row-song${trackId}`);

                        if (infoItem) {
                            const info = JSON.parse(infoItem.innerText);
                            if (
                                info &&
                                info.artist.toLowerCase().split("###")[0] ===
                                    artistName.toLowerCase() &&
                                info.albumtitle.toLowerCase() ===
                                    albumName.toLowerCase()
                            ) {
                                const addToPlaylistItem = songElements.querySelector<
                                    HTMLElement
                                >(".queue-addplaylisticon");

                                if (addToPlaylistItem) {
                                    addToPlaylistItem.click();
                                    return true;
                                }
                            }
                        }
                    }

                    return false;
                },
                suggestion.trackId,
                songItem.singer,
                songItem.album
            );

            console.log(`${suggestion.url} - ${addToPlaylistClicked}`);

            if (addToPlaylistClicked) {
                await songPage.waitForSelector(".follow_inner.addedplaylist", {
                    visible: true
                });

                const isAdded = await songPage.evaluate((listName) => {
                    const listElements = document.querySelectorAll<HTMLElement>(
                        "a.playlistname"
                    );

                    const itemToClick = Array.from(listElements).find(
                        (elem) => elem.innerText === listName
                    );

                    if (itemToClick) {
                        itemToClick.click();
                        return true;
                    }

                    return false;
                }, playlistName);

                console.log(`Added ${suggestion.url} - ${isAdded}`);
            }

            songPage.close();
        }
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

        // const mockList = [
        //     {
        //         name: "high end",
        //         singer: "Diljit Dosanjh",
        //         year: 2018,
        //         album: "Con.Fi.Den.Tial"
        //     },
        //     {
        //         name: "high rated gabru",
        //         singer: "Guru Randhawa",
        //         year: 2017,
        //         album: "high rated gabru"
        //     }
        // ];
        await gaana(browser, playListName, songList);
    } catch (e) {
        console.error(e);
    }

    await browser.close();
})();
