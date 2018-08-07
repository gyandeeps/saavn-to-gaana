import * as puppeteer from "puppeteer";
import { escape } from "querystring";

const enum ErrorStates {
    NO_LIST = "NO_LIST"
}

type SongDetails = {
    name: string;
    singer: string;
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
    // await page.waitForSelector(".mymsc > .createplaylist > a", {
    //     visible: true
    // });
    // await page.waitFor(1000);
    // await page.click(".mymsc > .createplaylist > a");
    // await page.waitFor(3000);
    // await page.click(".mymsc > .createplaylist > a");
    // await page.waitFor(3000);
    // await page.waitForSelector("#playlist_name", { visible: true });
    // await page.waitFor(3000);
    // await page.type("#playlist_name", playlistName);
    // await page.waitForSelector(".following > .createplaylist > svg", {
    //     visible: true
    // });
    // await page.click(".following > .createplaylist > svg");
    await page.waitFor(3000);

    // gyandeeps@gmail.com

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

        console.log(suggestionList);

        for (const suggestion of suggestionList) {
            const songPage = await browser.newPage();

            await songPage.goto(
                `https://gaana.com${suggestion.url.replace("\\", "")}`
            );
            await songPage.waitForSelector(
                ".details-list-paddingnone.content-container.albumlist"
            );

            const addToPlaylistClicked: boolean = await page.evaluate(
                (trackId, artistName) => {
                    const songElements = document.querySelector<HTMLElement>(
                        `li[data-value="song${trackId}"]`
                    );

                    if (songElements) {
                        const artistItem = songElements.querySelector<
                            HTMLElement
                        >(".s_artist.desktop > div > a");

                        if (
                            artistItem &&
                            artistItem.title.toLowerCase() ===
                                artistName.toLowerCase()
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

                    return false;
                },
                suggestion.trackId,
                songItem.singer
            );

            console.log(`${suggestion.url} - ${addToPlaylistClicked}`);

            if (addToPlaylistClicked) {
                await songPage.waitForSelector(".follow_inner.addedplaylist");

                await page.evaluate((listName) => {
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
        // const songList = await saavn(browser, playListName);

        // console.log(songList);
        await gaana(browser, playListName, [
            {
                name: "high end",
                singer: "Diljit Dosanjh"
            },
            {
                name: "high rated gabru",
                singer: "Guru Randhawa"
            }
        ]);
    } catch (e) {
        console.error(e);
    }

    await browser.close();
})();
