import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const TableColumnMoveLeftIcon = memo(
  ({ className, ...props }: SvgProps) => {
    return (
      <svg
        width="24"
        height="24"
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M2 5C2 3.89543 2.89543 3 4 3H14C15.1046 3 16 3.89543 16 5V20C16 21.1046 15.1046 22 14 22H4C2.89543 22 2 21.1046 2 20V5ZM8 5H4V10H8V5ZM10 5V10H14V5H10ZM14 12H10V20H14V12ZM8 20V12H4V20H8Z"
          fill="currentColor"
        />
        <path
          d="M14 12C14 11.7348 14.1054 11.4804 14.2929 11.2929L18.2929 7.29289C18.6834 6.90237 19.3166 6.90237 19.7071 7.29289C20.0976 7.68342 20.0976 8.31658 19.7071 8.70711L17.4142 11H23C23.5523 11 24 11.4477 24 12C24 12.5523 23.5523 13 23 13H17.4142L19.7071 15.2929C20.0976 15.6834 20.0976 16.3166 19.7071 16.7071C19.3166 17.0976 18.6834 17.0976 18.2929 16.7071L14.2929 12.7071C14.1054 12.5196 14 12.2652 14 12Z"
          fill="currentColor"
        />
      </svg>
    )
  },
)

TableColumnMoveLeftIcon.displayName = "TableColumnMoveLeftIcon"
