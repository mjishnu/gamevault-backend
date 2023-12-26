import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import configuration from "../../../configuration";
import { GamesService } from "../../games/games.service";
import { RawgMapperService } from "./mapper.service";
import { RawgGame } from "./models/game.interface";
import { Result as RawgResult, SearchResult } from "./models/games.interface";
import { Game } from "../../games/game.entity";
import { catchError, firstValueFrom } from "rxjs";
import { HttpService } from "@nestjs/axios";
import { AxiosError } from "axios";
import stringSimilarity from "string-similarity-js";

@Injectable()
export class RawgService {
  private readonly logger = new Logger(RawgService.name);

  constructor(
    @Inject(forwardRef(() => GamesService))
    private gamesService: GamesService,
    private mapper: RawgMapperService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Check the games in the database against the RAWG API to see if they need to
   * be updated in the database or not.
   */
  public async checkCache(games: Game[]): Promise<void> {
    if (configuration.TESTING.RAWG_API_DISABLED) {
      this.logger.warn(
        "Skipping RAWG Cache Check because RAWG API is disabled",
      );
      return;
    }

    if (!configuration.RAWG_API.KEY) {
      this.logger.warn(
        "Skipping RAWG Cache Check because RAWG API Key is not set",
      );
      return;
    }

    this.logger.log("STARTED RAWG CACHE CHECK");

    for (const game of games) {
      try {
        await this.cache(game);
        this.logger.debug(
          { gameId: game.id, title: game.title },
          `Game Cached Successfully`,
        );
      } catch (error) {
        this.logger.error(
          {
            gameId: game.id,
            title: game.title,
            error,
          },
          "Game Caching Failed",
        );
      }
    }
    this.logger.log("FINISHED RAWG CACHE CHECK");
  }

  /**
   * Caches the specified game in the database by finding a matching game in the
   * RAWG API and mapping the data to a Game object.
   */
  private async cache(game: Game): Promise<Game> {
    this.logger.debug(`Caching Game: "${game.title}"`);

    if (game.file_path.includes("(NC)")) {
      this.logger.debug(
        { gameId: game.id, title: game.title, file_path: game.file_path },
        `Game Caching Skipped, because file path contains NO CACHE flag (NC).`,
      );
      return game;
    }

    if (!this.isOutdated(game)) {
      this.logger.debug(
        { gameId: game.id, title: game.title, cachedAt: game.cache_date },
        `Game Caching Skipped, because game is already up to date.`,
      );
      return game;
    }

    const rawgEntry: RawgGame = game.rawg_id
      ? await this.fetchByRawgId(game.rawg_id)
      : await this.getBestMatch(
          game.title,
          game.release_date?.getFullYear() || undefined,
        );
    const mappedGame = await this.mapper.mapRawgGameToGame(rawgEntry, game);
    return await this.gamesService.save(mappedGame);
  }

  /**
   * Searches for the best matching game in the RAWG API based on the specified
   * title and release year.
   */
  private async getBestMatch(
    title: string,
    releaseYear?: number,
  ): Promise<RawgGame> {
    const sortedResults = await this.fetchMatching(title, releaseYear);
    const bestMatch = sortedResults[0];

    if (bestMatch.probability != 1) {
      this.logger.log(`${sortedResults.length} matches found for "${title}"`);
      this.logger.debug("-- START OF MATCHES --");
      for (const match of sortedResults) {
        if (match.probability === 0) continue;
        this.logger.debug(
          `➥ Match: "${match.name} (${new Date(
            match.released,
          ).getFullYear()})" | RAWG-ID: "${match.id}" | Probability: ${
            match.probability
          }`,
        );
      }
      this.logger.debug("-- END OF MATCHES --");
    }

    return this.fetchByRawgId(bestMatch.id);
  }

  /**
   * Fetches matching game titles from the RAWG API. If a release year is
   * provided, it fetches games with the given title and release year. If no
   * release year is provided or no matching game is found with the release
   * year, it fetches games with the given title only.
   *
   * @param title - The title of the game.
   * @param releaseYear - The release year of the game (optional).
   * @returns An array of RawgResult objects representing the matching game
   *   titles.
   * @throws NotFoundException if no matching game is found.
   */
  public async fetchMatching(
    title: string,
    releaseYear?: number,
  ): Promise<RawgResult[]> {
    // Array to store the search results
    const searchResults: RawgResult[] = [];

    // If releaseYear is provided, fetch games with the given title and release year
    if (releaseYear) {
      searchResults.push(...(await this.fetch(title, releaseYear)).results);
    }

    // If no search results are found with the release year, fetch games with the given title only
    if (searchResults.length === 0) {
      searchResults.push(...(await this.fetch(title)).results);
    }

    // If no search results are found, throw a NotFoundException
    if (searchResults.length === 0) {
      const errorMessage = `No game found in RAWG for "${title}" ${
        releaseYear ? `(${releaseYear})` : ""
      }`;
      this.logger.log(
        `➥ "${title} (${releaseYear || "No Year"})" | ${errorMessage}`,
      );
      throw new NotFoundException(errorMessage);
    }

    // Calculate the probability of matching for each game
    searchResults.forEach((game) => {
      const titleCleaned = title.toLowerCase().replace(/[^\w\s]/g, "");
      const gameNameCleaned = game.name.toLowerCase().replace(/[^\w\s]/g, "");

      // Calculate string similarity between the title and game name
      game.probability = stringSimilarity(titleCleaned, gameNameCleaned);

      // If releaseYear is provided, adjust the probability based on the difference between the release year of the game and the provided release year
      if (releaseYear !== undefined) {
        const gameReleaseYear = new Date(game.released).getFullYear();
        game.probability -= Math.abs(releaseYear - gameReleaseYear) / 10;
      }
    });

    // Sort the search results by probability in descending order
    searchResults.sort((a, b) => b.probability - a.probability);

    // Return the search results
    return searchResults;
  }

  /** Determines whether a game's cache is outdated. */
  private isOutdated(game: Game) {
    if (!game.cache_date) {
      this.logger.debug(`➥ "${game.title}" | Uncached`);
      return true;
    }

    if (
      new Date().getTime() - game.cache_date.getTime() >
      configuration.RAWG_API.CACHE_DAYS * 24 * 60 * 60 * 1000
    ) {
      this.logger.debug(
        `➥ "${game.title}" | Cache outdated | Cache Date: ${game.cache_date}`,
      );
      return true;
    }
    return false;
  }

  /** Returns the RawgGame object associated with the specified ID. */
  private async fetchByRawgId(id: number): Promise<RawgGame> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .get(`${configuration.RAWG_API.URL}/games/${id}`, {
            params: { key: configuration.RAWG_API.KEY },
          })
          .pipe(
            catchError((error: AxiosError) => {
              throw new InternalServerErrorException(
                error,
                `Serverside RAWG Request Error: ${error.status} ${error.message}`,
              );
            }),
          ),
      );
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(
        error,
        "Fetching data from RAWG failed",
      );
    }
  }

  /**
   * Retrieves a list of games from the RAWG API based on optional search
   * criteria.
   */
  private async fetch(
    search?: string,
    releaseYear?: number,
  ): Promise<SearchResult> {
    const searchDates = releaseYear
      ? `${releaseYear}-01-01,${releaseYear}-12-31`
      : undefined;

    try {
      const response = await firstValueFrom(
        this.httpService
          .get(`${configuration.RAWG_API.URL}/games`, {
            params: {
              search,
              key: configuration.RAWG_API.KEY,
              dates: searchDates,
              stores: configuration.RAWG_API.INCLUDED_STORES.join(),
            },
          })
          .pipe(
            catchError((error: AxiosError) => {
              throw new InternalServerErrorException(
                error,
                `Serverside RAWG Request Error`,
              );
            }),
          ),
      );
      return response.data as SearchResult;
    } catch (error) {
      throw new InternalServerErrorException(
        error,
        "Fetching data from RAWG failed",
      );
    }
  }
}
