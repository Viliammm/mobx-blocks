import { makeAutoObservable } from "mobx"

export interface IPaginationProps {
  pageSize?: number
  onChange?: (params: IPaginationParams) => void
}

export interface IPaginationParams {
  page: number
  pageSize: number
}

export class Pagination {
  // ====================================================
  // Model
  // ====================================================
  page = 1
  pageSize = 20
  totalCount?: number

  // ====================================================
  // Constructor
  // ====================================================
  constructor(public props?: IPaginationProps) {
    makeAutoObservable(this)

    if (props?.pageSize) {
      this.pageSize = props.pageSize
    }
  }

  // ====================================================
  // Computed
  // ====================================================
  get canGoToNext() {
    if (!this.totalCount) {
      return true
    }

    return this.page * this.pageSize < this.totalCount
  }

  get params(): IPaginationParams {
    return {
      page: this.page,
      pageSize: this.pageSize,
    }
  }

  // ====================================================
  // Public
  // ====================================================
  init = (page?: number, pageSize?: number) => {
    if (page) this.page = page
    if (pageSize) this.pageSize = pageSize
  }

  setTotalCount = (count: number) => {
    this.totalCount = count
  }

  goToPrev = () => {
    if (this.page > 1) {
      this.page -= 1
    }
  }

  goToNext = () => {
    const { onChange } = this.props || {}

    if (this.canGoToNext) {
      this.page += 1

      if (onChange) {
        onChange(this.params)
      }
    }
  }
}
