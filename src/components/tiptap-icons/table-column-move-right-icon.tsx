import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const TableColumnMoveRightIcon = memo(
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
          d="M24 12C24 12.2652 23.8946 12.5196 23.7071 12.7071L19.7071 16.7071C19.3166 17.0976 18.6834 17.0976 18.2929 16.7071C17.9024 16.3166 17.9024 15.6834 18.2929 15.2929L20.5858 13H15C14.4477 13 14 12.5523 14 12C14 11.4477 14.4477 11 15 11H20.5858L18.2929 8.70711C17.9024 8.31658 17.9024 7.68342 18.2929 7.29289C18.6834 6.90237 19.3166 6.90237 19.7071 7.29289L23.7071 11.2929C23.8946 11.4804 24 11.7348 24 12Z"
          fill="currentColor"
        />
      </svg>
    )
  },
)

TableColumnMoveRightIcon.displayName = "TableColumnMoveRightIcon"
