import { makeAutoObservable, observable, reaction, runInAction } from "mobx"
import debounce from "debounce-promise"
import qs from "query-string"

import { ICollectionConfig, IFetchFnCursorOptions, IFetchFnOptions } from "./Collection.types"
import { IPaginationParams, Pagination } from "../Pagination"
import { CursorPagination, ICursorPaginationParams } from "../CursorPagination"
import { Sorting } from "../Sorting"

export class Collection<
  TItem,
  TFilters extends Record<string, any>,
  TSortBy extends string,
  TPagination extends typeof Pagination | typeof CursorPagination | undefined
> {
  // ====================================================
  // Model
  // ====================================================
  initialized = false

  data = observable<TItem>([])
  totalCount = 0

  fetching = false
  fetchErr?: unknown

  searching = false
  searchErr?: unknown
  searchQuery = ""

  sorting: Sorting<TSortBy>
  filtersMap = observable(new Map())
  pagination?: Pagination
  cursorPagination?: CursorPagination

  // ====================================================
  // Constructor
  // ====================================================
  constructor(public config: ICollectionConfig<TItem, TFilters, TSortBy, TPagination>) {
    makeAutoObservable(this, { config: false })

    this.handleSearch = debounce(this.handleSearch, 500)

    this.sorting = new Sorting<TSortBy>({
      onChange: () => this.fetch(),
    })

    if (this.config.pagination === Pagination) {
      this.pagination = new Pagination({
        pageSize: this.config.pageSize,
        onChange: () => this.fetch(),
      })
    }

    if (this.config.pagination === CursorPagination) {
      this.cursorPagination = new CursorPagination({
        pageSize: this.config.pageSize,
        onChange: (params) => this.fetch(params as IFetchFnOptions<TFilters, TSortBy>),
      })
    }

    if (config.initialFilters) {
      this.filtersMap.replace(config.initialFilters)
    }

    if (config.syncParamsToUrl) {
      reaction(() => this.filtersMap.keys(), this.syncFetchParamsToUrl)
    }
  }

  // ====================================================
  // Computed
  // ====================================================
  get filters(): TFilters {
    return Object.fromEntries(this.filtersMap)
  }

  get queryParams() {
    const paginationParams = this.pagination
      ? this.pagination.params
      : this.cursorPagination
      ? this.cursorPagination.params
      : {}

    return {
      ...this.filters,
      ...this.sorting.params,
      ...paginationParams,
    } as TFilters &
      (TPagination extends typeof Pagination
        ? IPaginationParams
        : TPagination extends typeof CursorPagination
        ? ICursorPaginationParams
        : IAnyObject)
  }

  // ====================================================
  // Private
  // ====================================================
  private syncFetchParamsToUrl = () => {
    history.replaceState("", "", `${location.pathname}?${qs.stringify(this.queryParams)}`)
  }

  private handleSearch = async (opts: { shouldThrowError?: boolean }) => {
    const { searchFn, errorHandlerFn } = this.config
    if (!searchFn) {
      return
    }

    this.searching = true

    try {
      const data = await searchFn(this.searchQuery)
      this.data.replace(data)
    } catch (err) {
      this.searchErr = err

      if (errorHandlerFn) {
        errorHandlerFn(err)
      }

      if (opts.shouldThrowError) {
        throw err
      }
    } finally {
      this.searching = false
    }
  }

  // ====================================================
  // Public
  // ====================================================
  /**
   * Perform fetch API request
   */
  fetch = async (
    opts: TPagination extends CursorPagination
      ? IFetchFnCursorOptions<TFilters, TSortBy>
      : IFetchFnOptions<TFilters, TSortBy> = {}
  ) => {
    const { fetchFn, errorHandlerFn } = this.config
    const { clearFilters, query, sortBy, sortAscending, page, pageSize, pageCursor } = opts

    if (pageCursor && !this.cursorPagination) {
      console.warn('"pageCursor" param passed but CursorPagination not initialized')
    }

    /**
     * Sorting
     */
    this.sorting.setParams(sortBy, sortAscending)

    /**
     * Pagination
     */
    if (this.pagination) {
      this.pagination.init(page, pageSize)
    } else if (this.cursorPagination) {
      this.cursorPagination.init(pageCursor, pageSize)
    }

    /**
     * Filters
     */
    const filters = query ? qs.parse(query) : opts.filters
    if (filters) {
      if (clearFilters) this.setFetchParams(filters as TFilters)
      else this.mergeFetchParams(filters as TFilters)
    }

    this.fetching = true

    return runInAction(async () => {
      try {
        const res = await fetchFn(this.queryParams)

        this.data.replace(res.data)

        if ("totalCount" in res) {
          this.totalCount = res.totalCount
        }

        if (this.cursorPagination) {
          if ("nextPageCursor" in res) {
            this.cursorPagination.setNext(res.nextPageCursor || null)
          }

          if ("prevPageCursor" in res) {
            this.cursorPagination.setPrev(res.prevPageCursor || null)
          }
        }

        return res
      } catch (err) {
        this.fetchErr = err

        if (errorHandlerFn) {
          errorHandlerFn(err)
        }

        if (opts.shouldThrowError) {
          throw err
        }

        return { data: [], totalCount: 0 }
      } finally {
        this.fetching = false
        this.initialized = true
      }
    })
  }

  /**
   * Performs the initial fetch, skips if initiliazed already
   */
  init = async (opts: IFetchFnOptions<TFilters, TSortBy> = {}): Promise<void> => {
    if (!this.initialized) {
      await this.fetch(opts)
    }
  }

  /**
   * Set fetch filters
   */
  setFetchParams = async (filters: TFilters) => {
    this.filtersMap.clear()
    this.filtersMap.replace(filters)
  }

  /**
   * Merge fetch filters
   */
  mergeFetchParams = async (filters: Partial<TFilters>) => {
    this.filtersMap.merge(filters)
  }

  /**
   * Clear all fetch filters from state
   */
  clearFetchParams = () => {
    this.filtersMap.clear()
  }

  /**
   * Clear specific fetch param from state
   */
  clearFetchParam = (key: keyof TFilters) => {
    this.filtersMap.delete(key.toString())
  }

  /**
   * Reset fetch filters to defaults (passed in the constructor)
   */
  resetFetchParams = () => {
    this.filtersMap.replace(this.config.initialFilters || {})
  }

  /**
   * Perform debounced search using search query and fetch filters
   */
  search = async (query: string, opts: IFetchFnOptions<TFilters, TSortBy> = {}) => {
    this.searchQuery = query
    return this.handleSearch(opts)
  }

  // /**
  //  * Set param key to sort the data by
  //  */
  // setOrderBy = (orderBy?: T["orderBy"]) => {
  //   this.orderBy = orderBy
  // }

  // /**
  //  * Set the direction to sort the data with
  //  */
  // toggleOrderDirection = () => {
  //   this.orderAscending = !this.orderAscending
  // }

  /**
   * Helper to either set a new orderBy key or toggle direction if it's the same
   */
  // setOrderHelper = async (orderBy?: T["orderBy"]) => {
  //   if (orderBy === this.orderBy) {
  //     this.toggleOrderDirection()
  //   } else {
  //     this.orderAscending = false
  //   }

  //   await this.fetch({
  //     orderBy,
  //     orderAscending: this.orderAscending,
  //   })
  // }

  /**
   * Reset all state to initial
   */
  resetState = () => {
    this.initialized = false

    this.data.clear()
    this.totalCount = 0

    this.filtersMap.clear()
    this.searchQuery = ""

    // this.orderBy = undefined
    // this.orderAscending = false
    // this.page = 1
    // this.pageSize = PAGE_SIZE_DEFAULT

    this.fetching = false
    this.fetchErr = undefined

    this.searching = false
    this.searchQuery = ""
    this.searchErr = undefined
  }
}

// export const createCollection = <T extends ICollectionGenerics>(props: ICollectionConfig<T>) =>
//   new Collection<T>(props)
