import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const TableRowMoveDownIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M17 24C16.7348 24 16.4804 23.8946 16.2929 23.7071L12.2929 19.7071C11.9024 19.3166 11.9024 18.6834 12.2929 18.2929C12.6834 17.9024 13.3166 17.9024 13.7071 18.2929L16 20.5858V15C16 14.4477 16.4477 14 17 14C17.5523 14 18 14.4477 18 15V20.5858L20.2929 18.2929C20.6834 17.9024 21.3166 17.9024 21.7071 18.2929C22.0976 18.6834 22.0976 19.3166 21.7071 19.7071L17.7071 23.7071C17.5196 23.8946 17.2652 24 17 24Z"
        fill="currentColor"
      />
    </svg>
  )
})

TableRowMoveDownIcon.displayName = "TableRowMoveDownIcon"
