import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const TableRowMoveUpIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M4 3C2.89543 3 2 3.89543 2 5V15C2 16.1046 2.89543 17 4 17H20C21.1046 17 22 16.1046 22 15V5C22 3.89543 21.1046 3 20 3H4ZM4 10V5H10V10H4ZM12 10V5H20V10H12ZM20 12H12V15H20V12ZM10 15V12H4V15H10Z"
        fill="currentColor"
      />
      <path
        d="M17 14C17.2652 14 17.5196 14.1054 17.7071 14.2929L21.7071 18.2929C22.0976 18.6834 22.0976 19.3166 21.7071 19.7071C21.3166 20.0976 20.6834 20.0976 20.2929 19.7071L18 17.4142V23C18 23.5523 17.5523 24 17 24C16.4477 24 16 23.5523 16 23V17.4142L13.7071 19.7071C13.3166 20.0976 12.6834 20.0976 12.2929 19.7071C11.9024 19.3166 11.9024 18.6834 12.2929 18.2929L16.2929 14.2929C16.4804 14.1054 16.7348 14 17 14Z"
        fill="currentColor"
      />
    </svg>
  )
})

TableRowMoveUpIcon.displayName = "TableRowMoveUpIcon"
