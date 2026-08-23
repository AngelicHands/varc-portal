package backup

// Mongo collection names (mongoose default pluralization).
var BackupCollectionNames = []string{
	"articles",
	"categories",
	"pages",
	"pagetemplates",
	"menuitems",
	"sitesettings",
	"formdefinitions",
	"formsubmissions",
	"mailmessages",
	"media",
	"users",
	"qsologs",
	"apitokens",
	"userdocuments",
	"approles",
	"callsigns",
	"callsignoperators",
	"callsignlicenses",
	"callsignimports",
}

const (
	collectionFormSubmissions = "formsubmissions"
	collectionMedia           = "media"
	collectionUserDocuments   = "userdocuments"
)
