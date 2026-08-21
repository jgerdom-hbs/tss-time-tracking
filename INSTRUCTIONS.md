# TSS Time-Tracking App
First and foremost, use of this app is voluntary. The goal is to collect data to support our efforts to improve the odds of securing the option to work remotely.

The No. 1 thing about this app is to be patient. Each landing page load, data save, and change of scope on the data tab triggers a flow that reads and writes data on a SharePoint site. There can be several seconds between a click and a visible change. That's the tradeoff for being able to host this page publicly while storing all of the data securely.

## The Concept
Technicians enter how they spent their time and appointment lag time at the end of each day. The data is compiled to show the percentage of time that could have been remote and the urgency of appointments relative to when the technician was assigned the ticket.

*Note: You can enter time as far back as Aug. 3.*

## The PIN
Enter your assigned PIN to advance past the landing page. This should only have to be done once unless cookies are cleared or a different browser is used. This is not Fort Knox; the PIN is only there so technician names aren't stored or transmitted publicly and to prevent a non-technician who might get the URL from seeing the data.

*PINs will be shared via secure email.*

## The Actions
### 1 - Hours
Select the date then enter hours in one of the six categories. The app presents an alert if more than eight hours are entered. That's okay if OT is included.

Notes are only there to record something highly unusual about the day.

*Important: only enter time worked. If you're out, just ignore that time. The goal is a percentage of time worked that could be remote. OOO isn't a part of that calculation.*

### 2 - Appointments
Select the date then think about each of your user appointments. They will either be **In Person** or **Remote**. Then figure out the time between today (the day of the appointment) and *when the ticket was assigned to you*, not when the user submitted the ticket. With those two things in mind, add one to the appropriate selection.

*Example:*

* **Day 0:** The ticket was assigned to you on a Thursday, and you reached out the same day.
* **Day 1:** The following day, the user asked if you could meet via Zoom on Tuesday.
* **Day 2:** *No action taken*
* **Day 3:** You resolve the user's issue via Zoom on Tuesday.
* **Day 3:** At the end of Tuesday, add 1 to the **Three to four days** field in the **Remote** column.

### 3 - Data
Toggle between your data and the team's aggregate data.

Note: Team data updates each night at 1 a.m. unless Jason manually triggers the flow to compile team data.

## The URL
https://jgerdom-hbs.github.io/tss-time-tracking/

## The Footnote
This is the most complex project Jason has built, but it should be stable enough for our needs. However, if anything is confusing or needs to be changed, just let him know. His top priority is to build something techs will use.