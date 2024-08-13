const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

// Set up the application
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'public', 'views'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Variable to store events
let var_arr = ['Extracting finished. Refresh the browser to see your Google events.'];

// Route to render index.html
app.get('/', (req, res) => {
  res.render('index.html');
});

// Route to handle POST requests and list events
app.post('/', async (req, res) => {
  const tkn = req.body.token;

  try {
    const auth = await authorize(tkn);
    const events = await listEvents(auth);
    var_arr = ['Extracting finished. Refresh the browser to see your Google events.'];
    if (events.length > 0) {
      events.forEach(event => var_arr.push(event));
    }
    res.render('index.html', { var_arr });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Route to handle creating new events
app.post('/events', async (req, res) => {
  try {
    const { summary, description } = req.body;
    const oAuth2Client = new google.auth.OAuth2(
      process.env.CLIENT_ID, process.env.CLIENT_SECRET
    );

    oAuth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    const eventStartTime = new Date();
    eventStartTime.setDate(eventStartTime.getDate() + 2);
    const eventEndTime = new Date(eventStartTime);
    eventEndTime.setMinutes(eventEndTime.getMinutes() + 60);

    const event = {
      summary,
      description,
      colorId: 6,
      start: { dateTime: eventStartTime.toISOString() },
      end: { dateTime: eventEndTime.toISOString() },
    };

    const freebusy = await calendar.freebusy.query({
      resource: {
        timeMin: eventStartTime.toISOString(),
        timeMax: eventEndTime.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    const eventArr = freebusy.data.calendars.primary.busy;
    if (eventArr.length === 0) {
      await calendar.events.insert({ calendarId: 'primary', resource: event });
      console.log('Event created successfully.');
    } else {
      console.log("Sorry I'm busy for that time...");
    }

    res.render('events.html', { message: 'Event processed' });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Authorize and return the OAuth2 client
async function authorize(token) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (token) {
    oAuth2Client.setCredentials({ access_token: token });
    return oAuth2Client;
  }

  try {
    const tokenContent = await fs.readFile(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(tokenContent));
    return oAuth2Client;
  } catch (err) {
    return getAccessToken(oAuth2Client);
  }
}

// Get a new token and return the OAuth2 client
async function getAccessToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  // Prompt the user to visit the URL and authorize the app
  // Handle the redirect to get the new token
}

// List the next 10 events on the user's primary calendar
async function listEvents(auth) {
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items;
  if (!events || events.length === 0) {
    return ['No upcoming events found.'];
  }
  return events.map(event => {
    const start = event.start.dateTime || event.start.date;
    return `${start} - ${event.summary}`;
  });
}

// Start the server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
